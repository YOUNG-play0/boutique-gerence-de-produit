import React, { useEffect, useRef, useState } from 'react';
import {
  Html5Qrcode,
  Html5QrcodeSupportedFormats,
  Html5QrcodeScannerState,
} from 'html5-qrcode';
import {
  X,
  Camera,
  AlertCircle,
  RefreshCw,
  Zap,
  Check,
  Package,
  Layers,
  Plus,
  Minus,
  Box,
  ShoppingCart,
  ScanLine,
} from 'lucide-react';
import { ProductWithStock, UnitType } from '../../types';
import { formatGNF, playBeep, playSuccessChime, triggerHaptic } from '../../utils/formatters';
import { recordScanUse } from '../../services/telemetry';

interface QRScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: ProductWithStock[];
  onAddToCart: (product: ProductWithStock, unitType: UnitType, quantity: number) => void;
  onOpenPack?: (productId: string) => Promise<void>;
}

export const QRScannerModal: React.FC<QRScannerModalProps> = ({
  isOpen,
  onClose,
  products,
  onAddToCart,
  onOpenPack,
}) => {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [lastScannedFeedback, setLastScannedFeedback] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [manualCode, setManualCode] = useState('');

  // Fenêtre "Quantité" (Bottom Sheet) après un scan réussi
  const [scannedProduct, setScannedProduct] = useState<ProductWithStock | null>(null);
  const [selectedFormat, setSelectedFormat] = useState<UnitType>('unit');
  const [quantity, setQuantity] = useState<number>(1);
  const [quantityInputStr, setQuantityInputStr] = useState<string>('1');
  const [isOpeningPack, setIsOpeningPack] = useState(false);

  const scannerContainerId = 'qr-reader-container';

  // Refs pour gestion sûre du cycle de vie caméra
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isStartingRef = useRef(false);
  const isStoppingRef = useRef(false);
  const startPromiseRef = useRef<Promise<unknown> | null>(null);
  const sessionIdRef = useRef(0);
  const lastScanTimestampRef = useRef<number>(0);

  // Garde synchronisé le produit scanné avec la liste de produits à jour (ex: après ouverture d'un carton)
  useEffect(() => {
    if (scannedProduct) {
      const upToDate = products.find((p) => p.id === scannedProduct.id);
      if (upToDate) {
        setScannedProduct(upToDate);
      }
    }
  }, [products]);

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

      // Arrêt forcé et propre de tous les flux média vidéo existants dans le conteneur (Point D.18)
      try {
        const container = document.getElementById(scannerContainerId);
        const videos = container?.querySelectorAll('video');
        videos?.forEach((video) => {
          if (video.srcObject instanceof MediaStream) {
            video.srcObject.getTracks().forEach((track) => {
              try {
                track.stop();
              } catch {
                // ignore
              }
            });
            video.srcObject = null;
          }
        });
      } catch (domErr) {
        console.debug('Tracks direct stop handled:', domErr);
      }

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
      setScannedProduct(null);
      return;
    }

    sessionIdRef.current += 1;
    const currentSessionId = sessionIdRef.current;

    setIsInitializing(true);
    setErrorMessage(null);
    setScannedProduct(null);

    const startScanner = async () => {
      isStartingRef.current = true;
      try {
        await new Promise((r) => setTimeout(r, 150));
        if (sessionIdRef.current !== currentSessionId) return;

        const scanner = new Html5Qrcode(scannerContainerId, {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.QR_CODE,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.UPC_A,
          ],
          verbose: false,
        });

        scannerRef.current = scanner;

        const startPromise = scanner.start(
          { facingMode: 'environment' },
          {
            fps: 12,
            qrbox: { width: 230, height: 230 },
            aspectRatio: 1.0,
          },
          (decodedText) => {
            if (sessionIdRef.current === currentSessionId) {
              handleDecodedText(decodedText);
            }
          },
          () => {
            // onScanFailure - ignoré
          }
        );

        startPromiseRef.current = startPromise;
        await startPromise;

        if (sessionIdRef.current !== currentSessionId) {
          await stopScannerSafe();
          return;
        }

        setIsInitializing(false);

        try {
          const capabilities = scanner.getRunningTrackCapabilities();
          setHasTorch(!!(capabilities as Record<string, unknown>)?.torch);
        } catch {
          setHasTorch(false);
        }
      } catch (err: unknown) {
        if (sessionIdRef.current !== currentSessionId) return;

        setIsInitializing(false);
        const errStr = err instanceof Error ? err.message : String(err);
        console.warn('Erreur activation caméra:', errStr);

        if (errStr.includes('NotAllowedError') || errStr.includes('Permission') || errStr.includes('denied')) {
          setErrorMessage("L'accès à la caméra a été refusé. Veuillez autoriser la caméra dans les réglages de votre appareil.");
        } else if (errStr.includes('NotFoundError') || errStr.includes('DevicesNotFoundError')) {
          setErrorMessage("Aucune caméra disponible sur cet appareil. Utilisez la saisie manuelle ci-dessous.");
        } else {
          setErrorMessage("Caméra non disponible sur cet appareil. Utilisez les boutons de test rapide ou la saisie manuelle.");
        }
      } finally {
        isStartingRef.current = false;
        startPromiseRef.current = null;
      }
    };

    startScanner();

    // Arrêt de la caméra si l'application passe en arrière-plan ou change d'onglet (Point D.18)
    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopScannerSafe();
        onClose();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handleVisibilityChange);
      sessionIdRef.current += 1;
      stopScannerSafe();
    };
  }, [isOpen, onClose]);

  const lastScannedItemRef = useRef<{ code: string; timestamp: number } | null>(null);

  const handleDecodedText = (decodedText: string) => {
    // Si la fenêtre de quantité est déjà ouverte, ne pas écraser
    if (scannedProduct) return;

    const cleanText = decodedText.trim();
    if (!cleanText) return;

    const now = Date.now();
    // Anti double scan du même code en moins d'une seconde (Point D.20)
    if (
      lastScannedItemRef.current &&
      lastScannedItemRef.current.code === cleanText &&
      now - lastScannedItemRef.current.timestamp < 1000
    ) {
      return;
    }
    lastScannedItemRef.current = { code: cleanText, timestamp: now };
    lastScanTimestampRef.current = now;
    recordScanUse().catch(() => {});

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

      // Ouvre la fenêtre "Quantité"
      setScannedProduct(matchedProduct);
      setSelectedFormat('unit');
      setQuantity(1);
      setQuantityInputStr('1');
      setErrorMessage(null);
    } else {
      // Distinction claire : produit supprimé vs code QR inconnu (Point D.19)
      triggerHaptic(120);
      if (cleanText.includes('prod-')) {
        setErrorMessage("Ce code correspond à un produit qui a été supprimé de la boutique.");
      } else {
        setErrorMessage("Code QR non reconnu : aucun produit ne correspond à ce code.");
      }
      setTimeout(() => setErrorMessage(null), 3500);
    }
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

  // Logique de calcul de la quantité et du total
  const hasPack = !!(scannedProduct?.packSize && scannedProduct.packSize >= 2 && scannedProduct.packPrice);
  const packLabel = scannedProduct?.packLabel || 'carton';

  const maxAvailable = scannedProduct
    ? selectedFormat === 'pack'
      ? scannedProduct.stockPacks
      : scannedProduct.stockUnits
    : 0;

  const currentUnitPrice = scannedProduct
    ? selectedFormat === 'pack'
      ? scannedProduct.packPrice || 0
      : scannedProduct.price
    : 0;

  const lineTotal = quantity * currentUnitPrice;
  const isStockExceeded = quantity > maxAvailable;

  const canOpenCarton =
    selectedFormat === 'unit' &&
    hasPack &&
    scannedProduct &&
    scannedProduct.stockPacks > 0 &&
    quantity > scannedProduct.stockUnits;

  const handleFormatChange = (fmt: UnitType) => {
    setSelectedFormat(fmt);
    triggerHaptic(30);
    // Réinitialise la quantité à 1 par défaut lors du changement de format
    setQuantity(1);
    setQuantityInputStr('1');
  };

  const handleAdjustQty = (delta: number) => {
    setQuantity((prev) => {
      const next = Math.max(1, prev + delta);
      setQuantityInputStr(String(next));
      return next;
    });
    triggerHaptic(30);
  };

  const handleQuantityInputChange = (val: string) => {
    setQuantityInputStr(val);
    const parsed = parseInt(val, 10);
    if (!isNaN(parsed) && parsed >= 1) {
      setQuantity(parsed);
    } else if (val === '') {
      setQuantity(1);
    }
  };

  const handleOpenPackInScanner = async () => {
    if (!scannedProduct || !onOpenPack) return;
    try {
      setIsOpeningPack(true);
      await onOpenPack(scannedProduct.id);
      playSuccessChime();
      triggerHaptic(60);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erreur lors de l’ouverture du carton');
    } finally {
      setIsOpeningPack(false);
    }
  };

  const handleConfirmAddToCart = (closeAfter: boolean) => {
    if (!scannedProduct) return;

    if (quantity <= 0) return;
    if (quantity > maxAvailable) {
      triggerHaptic(100);
      return;
    }

    playSuccessChime();
    triggerHaptic(60);

    onAddToCart(scannedProduct, selectedFormat, quantity);

    const formatName = selectedFormat === 'pack' ? packLabel : 'unité';
    const feedbackText = `+${quantity} ${formatName}${quantity > 1 ? 's' : ''} de ${scannedProduct.name}`;

    if (closeAfter) {
      // "Ajouter au panier" : ajoute, ferme la fenêtre et la caméra
      onClose();
    } else {
      // "Ajouter et scanner le suivant" : ajoute et relance directement la caméra
      setLastScannedFeedback(feedbackText);
      setScannedProduct(null);
      setQuantity(1);
      setQuantityInputStr('1');
      lastScanTimestampRef.current = Date.now() + 1500; // anti-rebond immédiat sur le même code
      setTimeout(() => {
        setLastScannedFeedback((prev) => (prev === feedbackText ? null : prev));
      }, 2500);
    }
  };

  if (!isOpen) return null;

  // Photo selon le format choisi
  const currentPhoto = scannedProduct
    ? selectedFormat === 'pack'
      ? scannedProduct.packPhoto || scannedProduct.photo
      : scannedProduct.photo
    : undefined;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end sm:justify-center items-center bg-black/80 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-slate-900 text-white rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[95vh] relative">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-800/90 border-b border-slate-700/60 z-20">
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

        {/* Feedback Banner (Ajouté et scanner le suivant) */}
        {lastScannedFeedback && (
          <div className="bg-emerald-600 px-4 py-2.5 flex items-center justify-between text-white font-semibold text-xs animate-in slide-in-from-top duration-200 z-20">
            <div className="flex items-center gap-2 truncate">
              <Check className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">{lastScannedFeedback} ajouté au panier !</span>
            </div>
            <span className="text-[10px] bg-emerald-700 px-2 py-0.5 rounded-full font-bold">Scanné</span>
          </div>
        )}

        {/* Camera Viewport */}
        <div className="relative bg-black flex-1 min-h-[220px] sm:min-h-[260px] flex items-center justify-center overflow-hidden">
          <div id={scannerContainerId} className="w-full max-w-[320px] aspect-square rounded-2xl overflow-hidden" />

          {/* Scanner Overlay Visual Guide */}
          {!scannedProduct && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="w-56 h-56 border-2 border-amber-400/80 rounded-2xl relative shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]">
                <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-amber-400 rounded-tl-lg" />
                <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-amber-400 rounded-tr-lg" />
                <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-amber-400 rounded-bl-lg" />
                <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-amber-400 rounded-br-lg" />
                <div className="w-full h-0.5 bg-amber-400/70 absolute top-1/2 -translate-y-1/2 animate-pulse" />
              </div>
            </div>
          )}

          {isInitializing && (
            <div className="absolute inset-0 bg-slate-900/90 flex flex-col items-center justify-center p-6 text-center z-10">
              <RefreshCw className="w-8 h-8 text-amber-500 animate-spin mb-3" />
              <p className="text-sm font-medium text-slate-200">Démarrage de la caméra...</p>
              <p className="text-xs text-slate-400 mt-1">Veuillez autoriser l'accès si demandé</p>
            </div>
          )}

          {/* Torch toggle button */}
          {hasTorch && !isInitializing && !scannedProduct && (
            <button
              onClick={toggleTorch}
              className={`absolute top-4 right-4 p-3 rounded-full backdrop-blur-md transition z-20 ${
                torchOn ? 'bg-amber-400 text-slate-950 font-bold' : 'bg-black/50 text-white'
              }`}
            >
              <Zap className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Message d'erreur / Produit introuvable */}
        {errorMessage && (
          <div className="px-4 py-2.5 bg-rose-950/90 border-t border-rose-800 text-rose-200 text-xs flex items-center gap-2 z-20">
            <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400" />
            <p className="font-bold">{errorMessage}</p>
          </div>
        )}

        {/* FENÊTRE QUANTITÉ (Bottom sheet après un scan réussi) */}
        {scannedProduct ? (
          <div className="bg-slate-900 border-t-2 border-amber-500 p-4 sm:p-5 space-y-4 animate-in slide-in-from-bottom duration-200 z-30 max-h-[75vh] overflow-y-auto">
            {/* 1. Photo, nom et stock disponible */}
            <div className="flex items-center gap-3.5">
              <div className="w-16 h-16 rounded-2xl overflow-hidden bg-slate-800 border-2 border-amber-400/80 flex items-center justify-center flex-shrink-0 shadow-md">
                {currentPhoto ? (
                  <img
                    src={currentPhoto}
                    alt={scannedProduct.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-3xl">{scannedProduct.imageUrl || '📦'}</span>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <h3 className="text-base font-black text-white truncate leading-tight">
                  {scannedProduct.name}
                </h3>
                <div className="text-xs text-amber-400 font-bold mt-0.5">
                  {formatGNF(currentUnitPrice)}{' '}
                  <span className="text-[10px] text-slate-400 font-normal">
                    /{selectedFormat === 'pack' ? packLabel : 'unité'}
                  </span>
                </div>

                {/* Stock disponible (unités seules et cartons fermés) */}
                <div className="text-[11px] text-slate-300 font-medium mt-1">
                  Dispo :{' '}
                  <span className="font-bold text-white">
                    {hasPack
                      ? `${scannedProduct.stockPacks} ${packLabel}${scannedProduct.stockPacks > 1 ? 's' : ''} + ${scannedProduct.stockUnits} unité${scannedProduct.stockUnits > 1 ? 's' : ''}`
                      : `${scannedProduct.stockUnits} unité${scannedProduct.stockUnits > 1 ? 's' : ''}`}
                  </span>
                </div>
              </div>
            </div>

            {/* 2. Format vendu si produit carton : 2 gros boutons Unité / Carton */}
            {hasPack && (
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                  Format de vente :
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleFormatChange('unit')}
                    className={`py-3 px-3 rounded-2xl border-2 font-black text-xs flex flex-col items-center justify-center gap-1 transition active:scale-95 ${
                      selectedFormat === 'unit'
                        ? 'bg-amber-600 border-amber-400 text-white shadow-md shadow-amber-600/30'
                        : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-750'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <Package className="w-4 h-4" />
                      <span>Unité</span>
                    </div>
                    <span className="text-[10px] font-normal opacity-90">
                      Dispo : {scannedProduct.stockUnits}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleFormatChange('pack')}
                    className={`py-3 px-3 rounded-2xl border-2 font-black text-xs flex flex-col items-center justify-center gap-1 transition active:scale-95 ${
                      selectedFormat === 'pack'
                        ? 'bg-amber-600 border-amber-400 text-white shadow-md shadow-amber-600/30'
                        : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-750'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 capitalize">
                      <Layers className="w-4 h-4" />
                      <span>{packLabel} ({scannedProduct.packSize} un.)</span>
                    </div>
                    <span className="text-[10px] font-normal opacity-90">
                      Dispo : {scannedProduct.stockPacks}
                    </span>
                  </button>
                </div>
              </div>
            )}

            {/* 3. Sélecteur de quantité tactile (−, inputMode="numeric", +) */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-xs">
                <label className="font-bold text-slate-400 uppercase tracking-wider text-[11px]">
                  Quantité :
                </label>
                <span className="text-slate-400">
                  Maximum disponible : <strong className="text-white">{maxAvailable}</strong>
                </span>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleAdjustQty(-1)}
                  disabled={quantity <= 1}
                  className="w-14 h-14 rounded-2xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 border border-slate-700 active:scale-95 flex items-center justify-center text-white transition shadow-sm"
                  title="Diminuer"
                >
                  <Minus className="w-6 h-6" />
                </button>

                <div className="flex-1 relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={quantityInputStr}
                    onChange={(e) => handleQuantityInputChange(e.target.value.replace(/\D/g, ''))}
                    className="w-full h-14 text-center font-black text-2xl bg-slate-950 border-2 border-amber-400/70 rounded-2xl text-white focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold pointer-events-none capitalize">
                    {selectedFormat === 'pack' ? packLabel : 'un.'}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => handleAdjustQty(1)}
                  disabled={quantity >= maxAvailable}
                  className="w-14 h-14 rounded-2xl bg-amber-600 hover:bg-amber-500 disabled:opacity-40 active:scale-95 flex items-center justify-center text-white font-black transition shadow-md shadow-amber-600/30"
                  title="Augmenter"
                >
                  <Plus className="w-6 h-6" />
                </button>
              </div>

              {/* Message d'avertissement de stock dépassé */}
              {isStockExceeded && (
                <p className="text-xs font-bold text-rose-400 flex items-center gap-1.5 mt-1 animate-pulse">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>Il ne reste que {maxAvailable} en stock</span>
                </p>
              )}

              {/* 7. Bouton Ouvrir un carton si unités insuffisantes mais cartons disponibles */}
              {canOpenCarton && onOpenPack && (
                <div className="p-3 bg-amber-950/60 border border-amber-500/50 rounded-2xl flex items-center justify-between gap-2 mt-2">
                  <div className="text-xs text-amber-200">
                    <p className="font-bold">Unités seules insuffisantes ({scannedProduct.stockUnits} dispo)</p>
                    <p className="text-[11px] text-amber-300/80">
                      Il reste {scannedProduct.stockPacks} {packLabel}(s) fermé(s)
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={isOpeningPack}
                    onClick={handleOpenPackInScanner}
                    className="py-2 px-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-xl flex items-center gap-1.5 active:scale-95 transition flex-shrink-0 shadow-md"
                  >
                    <Box className="w-4 h-4" />
                    <span>Ouvrir 1 {packLabel} (+{scannedProduct.packSize})</span>
                  </button>
                </div>
              )}
            </div>

            {/* 4. Total de la ligne en GNF */}
            <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Total ligne :
              </span>
              <span className="text-xl font-black text-amber-400">
                {formatGNF(lineTotal)}
              </span>
            </div>

            {/* 5. Deux boutons d'action */}
            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                disabled={quantity <= 0 || isStockExceeded || maxAvailable <= 0}
                onClick={() => handleConfirmAddToCart(false)}
                className="py-3.5 px-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 border border-slate-700 text-white font-bold text-xs rounded-2xl active:scale-95 transition flex flex-col items-center justify-center gap-1 shadow-xs"
              >
                <ScanLine className="w-5 h-5 text-amber-400" />
                <span className="text-center leading-tight">Ajouter & scanner suivant</span>
              </button>

              <button
                type="button"
                disabled={quantity <= 0 || isStockExceeded || maxAvailable <= 0}
                onClick={() => handleConfirmAddToCart(true)}
                className="py-3.5 px-3 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white font-black text-xs rounded-2xl active:scale-95 transition flex flex-col items-center justify-center gap-1 shadow-lg shadow-amber-600/30"
              >
                <ShoppingCart className="w-5 h-5" />
                <span className="text-center leading-tight">Ajouter au panier</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setScannedProduct(null)}
              className="w-full py-2 text-center text-xs text-slate-400 hover:text-white font-semibold transition"
            >
              Annuler ce scan
            </button>
          </div>
        ) : (
          /* Simulation et saisie manuelle si pas de produit scanné */
          <div className="p-4 bg-slate-800/90 border-t border-slate-700/60 space-y-3 z-10">
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
                  className="flex-shrink-0 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-xl text-left border border-slate-600 text-white active:scale-95 transition flex items-center gap-2"
                >
                  <div className="w-7 h-7 rounded-lg overflow-hidden bg-slate-800 flex items-center justify-center flex-shrink-0">
                    {prod.photo ? (
                      <img src={prod.photo} alt={prod.name} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <span className="text-sm">{prod.imageUrl || '📦'}</span>
                    )}
                  </div>
                  <div>
                    <div className="text-xs font-bold truncate max-w-[100px]">{prod.name}</div>
                    <div className="text-[10px] text-amber-400 font-mono">
                      {prod.price.toLocaleString('fr-FR')} GNF
                    </div>
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
        )}
      </div>
    </div>
  );
};

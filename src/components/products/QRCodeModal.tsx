import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { X, Printer, Download, QrCode as QrIcon } from 'lucide-react';
import { Product } from '../../types';
import { formatGNF } from '../../utils/formatters';

interface QRCodeModalProps {
  isOpen: boolean;
  product: Product | null;
  onClose: () => void;
}

export const QRCodeModal: React.FC<QRCodeModalProps> = ({ isOpen, product, onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [dataUrl, setDataUrl] = useState<string>('');

  useEffect(() => {
    if (!isOpen || !product) return;

    // The QR Code payload: product ID is simple and uniquely resolves to the product
    const payload = product.id;

    if (canvasRef.current) {
      QRCode.toCanvas(
        canvasRef.current,
        payload,
        {
          width: 260,
          margin: 2,
          color: {
            dark: '#1e293b',
            light: '#ffffff',
          },
        },
        (error) => {
          if (error) console.error('Erreur génération QR:', error);
          else if (canvasRef.current) {
            setDataUrl(canvasRef.current.toDataURL('image/png'));
          }
        }
      );
    }
  }, [isOpen, product]);

  if (!isOpen || !product) return null;

  const handleDownload = () => {
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    const safeName = product.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    a.download = `qr_${safeName}.png`;
    a.click();
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl text-slate-800 text-center">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2 text-amber-700">
            <QrIcon className="w-5 h-5 text-amber-600" />
            <h3 className="text-base font-bold text-slate-900">QR Code Produit</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Printable Label Card */}
        <div className="my-5 p-4 rounded-2xl bg-amber-50/60 border border-amber-200/80 flex flex-col items-center shadow-xs">
          <div className="text-base font-bold text-slate-900 leading-tight mb-1">
            {product.name}
          </div>
          <div className="text-xl font-black text-amber-700 mb-1 tracking-wide">
            {formatGNF(product.price)} <span className="text-xs font-normal text-slate-500">/unité</span>
          </div>
          {product.packPrice && product.packSize && (
            <div className="text-xs font-bold text-slate-700 bg-amber-100 px-2 py-0.5 rounded-lg border border-amber-200 mb-3">
              {formatGNF(product.packPrice)} /{product.packLabel || 'carton'} ({product.packSize} un.)
            </div>
          )}

          <div className="p-3 bg-white rounded-xl shadow-xs border border-slate-200">
            <canvas ref={canvasRef} className="max-w-[200px] h-auto mx-auto" />
          </div>

          <div className="text-[11px] font-mono text-slate-500 mt-2 bg-slate-100 px-2 py-0.5 rounded">
            ID: {product.id}
          </div>
        </div>

        <p className="text-xs text-slate-500 mb-5">
          Imprimez cette étiquette ou collez-la sur l'étagère pour un scan instantané en caisse.
        </p>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={handleDownload}
            className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition active:scale-95"
          >
            <Download className="w-4 h-4" />
            <span>Télécharger</span>
          </button>

          <button
            onClick={handlePrint}
            className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-md transition active:scale-95"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimer</span>
          </button>
        </div>
      </div>
    </div>
  );
};

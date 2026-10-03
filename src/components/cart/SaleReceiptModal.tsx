import React from 'react';
import { CheckCircle2, Printer, X, ShoppingBag } from 'lucide-react';
import { Sale } from '../../types';
import { formatGNF, formatDateFrench } from '../../utils/formatters';

interface SaleReceiptModalProps {
  sale: Sale | null;
  onClose: () => void;
}

export const SaleReceiptModal: React.FC<SaleReceiptModalProps> = ({ sale, onClose }) => {
  if (!sale) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl text-slate-800">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2 text-emerald-600">
            <CheckCircle2 className="w-6 h-6" />
            <h3 className="text-base font-black text-slate-900">Vente Réussie !</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Receipt paper container */}
        <div className="my-4 p-4 rounded-2xl bg-amber-50/50 border border-amber-200/80 font-mono text-xs text-slate-700 shadow-inner">
          <div className="text-center pb-2 border-b border-dashed border-amber-300">
            <div className="font-bold text-sm text-slate-900">BOUTIQUE GUINÉE</div>
            <div className="text-[10px] text-slate-500">{formatDateFrench(sale.date)}</div>
            <div className="mt-1">
              <span
                className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                  sale.paymentType === 'cash'
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-200 text-amber-900'
                }`}
              >
                {sale.paymentType === 'cash' ? 'PAYÉ COMPTANT' : `À CRÉDIT : ${sale.customerName}`}
              </span>
            </div>
          </div>

          <div className="py-2 space-y-1.5 border-b border-dashed border-amber-300 max-h-40 overflow-y-auto">
            {sale.items.map((item, idx) => {
              const isPack = item.unitType === 'pack';
              const formatStr = isPack ? ` (${item.packLabel || 'carton'})` : '';

              return (
                <div key={idx} className="flex justify-between items-start text-[11px]">
                  <div className="truncate pr-2">
                    <span className="font-bold">{item.quantity}x </span>
                    <span className="font-semibold">{item.productName}</span>
                    {formatStr && <span className="text-[10px] text-amber-800 font-bold">{formatStr}</span>}
                  </div>
                  <span className="font-bold flex-shrink-0">{formatGNF(item.total)}</span>
                </div>
              );
            })}
          </div>

          <div className="pt-2 flex justify-between items-center text-sm font-black text-slate-900">
            <span>TOTAL :</span>
            <span className="text-amber-800 text-base">{formatGNF(sale.totalAmount)}</span>
          </div>
        </div>

        {/* Buttons */}
        <div className="space-y-2">
          <button
            onClick={onClose}
            className="w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-base shadow-lg shadow-emerald-600/30 transition flex items-center justify-center gap-2"
          >
            <ShoppingBag className="w-5 h-5" />
            <span>Nouvelle Vente</span>
          </button>

          <button
            onClick={handlePrint}
            className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 transition"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimer le ticket</span>
          </button>
        </div>
      </div>
    </div>
  );
};

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { ShieldCheck, RotateCcw } from 'lucide-react';
import { recordAppError } from '../../services/telemetry';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary a intercepté une erreur critique :', error, errorInfo);
    recordAppError().catch(() => {});
  }

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-amber-50/50 flex flex-col items-center justify-center p-6 text-center select-none">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-xl border border-amber-200/80 space-y-4">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center shadow-xs">
              <ShieldCheck className="w-8 h-8 text-amber-700" />
            </div>

            <div className="space-y-1">
              <h1 className="text-base font-black text-slate-900 leading-snug">
                Un problème est survenu, vos données sont en sécurité
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                Toutes les ventes, stocks et clients enregistrés sont préservés dans votre appareil.
              </p>
            </div>

            <button
              type="button"
              onClick={this.handleReload}
              className="w-full py-3.5 px-4 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-md shadow-amber-600/30 transition flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Recharger</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

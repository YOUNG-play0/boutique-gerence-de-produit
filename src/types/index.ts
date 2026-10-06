export type StockMovementType = 'initial' | 'reappro' | 'vente' | 'correction' | 'ouverture' | 'annulation';

export type CorrectionReason = 'casse' | 'vol' | 'erreur' | 'perime' | 'don' | 'autre';

export type UnitType = 'unit' | 'pack';
export type StockSupport = 'unit' | 'pack';

export interface Product {
  id: string;
  name: string;
  price: number; // Prix à l'unité en GNF
  category?: string;
  imageUrl?: string; // Ancien emoji/icône pour compatibilité
  photo?: string; // Photo du produit (data URL JPEG compressée)
  packPhoto?: string; // Photo du carton (data URL JPEG compressée)
  barcode?: string;
  alertThreshold: number; // Seuil d'alerte en unités seules
  // Vente par carton / format groupé
  packLabel?: string; // Libellé ("carton", "sac", "paquet", "caisse")
  packSize?: number; // Nombre d'unités par carton (>= 2)
  packPrice?: number; // Prix du carton en GNF
  alertThresholdPacks?: number; // Seuil d'alerte cartons fermés facultatif
  stockUnits?: number; // Compteur direct unités seules
  stockPacks?: number; // Compteur direct cartons fermés
  createdAt: string;
  updatedAt: string;
}

export interface StockMovement {
  id: string;
  productId: string;
  type: StockMovementType;
  support: StockSupport; // 'unit' (unités seules) ou 'pack' (cartons fermés)
  quantity: number; // Quantité (+ pour entrée, - pour sortie) dans le support spécifié
  reason?: CorrectionReason | string;
  note?: string;
  saleId?: string;
  date: string; // ISO string
}

export interface ProductWithStock extends Product {
  stockUnits: number; // Stock d'unités seules disponibles
  stockPacks: number; // Stock de cartons fermés disponibles
  currentStock: number; // Total équivalent (unités seules + cartons * packSize) pour compatibilité
  isLowStockUnits: boolean;
  isLowStockPacks: boolean;
  isLowStock: boolean;
}

export interface CartItem {
  product: Product;
  quantity: number; // Nombre de formats vendus (ex: 2 unités ou 2 cartons)
  unitPrice: number; // Prix unitaire du format vendu (price ou packPrice)
  unitType: UnitType; // 'unit' ou 'pack'
  packSize?: number; // Nombre d'unités par carton si pack
  packLabel?: string; // Nom du carton si pack
}

export type PaymentType = 'cash' | 'credit';

export interface SaleItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  total: number;
  unitType: UnitType; // 'unit' ou 'pack'
  packSize?: number;
  packLabel?: string;
}

export interface Sale {
  id: string;
  date: string; // ISO string
  items: SaleItem[];
  totalAmount: number; // in GNF
  paymentType: PaymentType;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  notes?: string;
  isCancelled?: boolean;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  address?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreditPayment {
  id: string;
  customerId: string;
  customerName: string;
  amount: number; // in GNF
  date: string; // ISO string
  note?: string;
}

export type CustomerDebtType = 'dette_initiale' | 'dette_manuelle';

export interface CustomerDebtEntry {
  id: string;
  customerId: string;
  customerName: string;
  amount: number; // in GNF
  type: CustomerDebtType;
  date: string; // ISO string
  note?: string; // ex: "Ancienne dette (carnet)"
  isCancelled?: boolean;
}

export interface CustomerWithBalance extends Customer {
  totalCreditPurchases: number;
  totalManualDebts: number;
  totalDebts: number; // totalCreditPurchases + totalManualDebts non annulées
  totalPayments: number;
  currentDebt: number;
  lastPurchaseDate?: string;
}

export interface ShopSettings {
  id?: string;
  installId?: string; // Identifiant anonyme unique au premier lancement (Point 1)
  shopName: string;
  shopOwner: string;
  phone: string;
  address: string;
  city?: string; // Ville (facultatif - Point 2 & 4)
  currency: string;
  pinHash?: string; // SHA-256 hash du PIN avec sel
  pinSalt?: string; // Sel aléatoire
  isConfigured: boolean; // false tant que l'écran d'inscription n'a pas été validé
  telemetryEnabled?: boolean; // Statistiques anonymes d'utilisation (activées par défaut - Point 4)
  createdAt?: string;
  updatedAt?: string;
}

export interface DailyUsageCounters {
  day: string; // YYYY-MM-DD local
  scanUses: number;
  assistantQuestions: number;
  nbErrors: number;
}

export interface TelemetryDailySummary {
  installId: string;
  shopName: string;
  city?: string;
  day: string; // YYYY-MM-DD local
  appVersion: string;
  isStandalone: boolean;
  nbSales: number;
  nbProducts: number;
  nbCustomersWithDebt: number;
  scanUses: number;
  assistantQuestions: number;
  packSales: number;
  nbErrors: number;
}

export interface AdminBoutiqueItem {
  installId: string;
  shopName: string;
  city?: string;
  firstActivity: string;
  lastActivity: string;
  salesLast7Days: number;
  nbProducts: number;
  appVersion: string;
  inactiveDays: number;
}

export interface AdminStatsResponse {
  totalInstalled: number;
  activeToday: number;
  activeLast7Days: number;
  activeLast30Days: number;
  retention: {
    days7: number;
    days14: number;
    days30: number;
  };
  activityCurve: Array<{ day: string; count: number }>;
  boutiques: AdminBoutiqueItem[];
  featureUsage: {
    scanPercentage: number;
    packPercentage: number;
    assistantPercentage: number;
    totalErrors: number;
  };
}

export interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  texte: string;
  horodatage: string;
}

export interface AssistantConversation {
  id: string;
  titre: string; // 40 premiers caractères de la première question
  date: string; // ISO string
  messages: AssistantMessage[];
}

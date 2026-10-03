export type StockMovementType = 'initial' | 'reappro' | 'vente' | 'correction';

export type CorrectionReason = 'casse' | 'vol' | 'erreur' | 'perime' | 'don' | 'autre';

export type UnitType = 'unit' | 'pack';

export interface Product {
  id: string;
  name: string;
  price: number; // Prix à l'unité en GNF
  category?: string;
  imageUrl?: string;
  barcode?: string;
  alertThreshold: number; // Seuil d'alerte en unités
  // Vente par carton / format groupé
  packLabel?: string; // Libellé ("carton", "sac", "paquet", "caisse")
  packSize?: number; // Nombre d'unités par carton (>= 2)
  packPrice?: number; // Prix du carton en GNF
  createdAt: string;
  updatedAt: string;
}

export interface StockMovement {
  id: string;
  productId: string;
  type: StockMovementType;
  quantity: number; // Toujours exprimé en UNITÉS physiques (+ pour entrée, - pour sortie)
  reason?: CorrectionReason | string;
  note?: string;
  saleId?: string;
  date: string; // ISO string
}

export interface ProductWithStock extends Product {
  currentStock: number; // Stock actuel en UNITÉS
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

export interface CustomerWithBalance extends Customer {
  totalCreditPurchases: number;
  totalPayments: number;
  currentDebt: number;
  lastPurchaseDate?: string;
}

export interface ShopSettings {
  id?: string;
  shopName: string;
  shopOwner: string;
  phone: string;
  address: string;
  currency: string;
  pinHash?: string; // SHA-256 hash du PIN avec sel
  pinSalt?: string; // Sel aléatoire
  isConfigured: boolean; // false tant que l'écran d'inscription n'a pas été validé
  createdAt?: string;
  updatedAt?: string;
}

import { openDB, DBSchema, IDBPDatabase } from 'idb';
import {
  Product,
  StockMovement,
  Sale,
  SaleItem,
  Customer,
  CreditPayment,
  ProductWithStock,
  CustomerWithBalance,
  ShopSettings,
  StockMovementType,
  CorrectionReason,
  UnitType,
} from '../types';
import { generateSalt, hashPin, verifyPin } from '../utils/crypto';

interface BoutiqueDB extends DBSchema {
  products: {
    key: string;
    value: Product;
    indexes: { 'by-name': string };
  };
  stock_movements: {
    key: string;
    value: StockMovement;
    indexes: { 'by-product': string; 'by-date': string };
  };
  sales: {
    key: string;
    value: Sale;
    indexes: { 'by-date': string; 'by-customer': string };
  };
  customers: {
    key: string;
    value: Customer;
    indexes: { 'by-name': string };
  };
  credit_payments: {
    key: string;
    value: CreditPayment;
    indexes: { 'by-customer': string; 'by-date': string };
  };
  settings: {
    key: string;
    value: ShopSettings;
  };
}

const DB_NAME = 'boutique_guinee_db';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<BoutiqueDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<BoutiqueDB>> {
  if (!dbPromise) {
    dbPromise = openDB<BoutiqueDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Products store
        if (!db.objectStoreNames.contains('products')) {
          const productStore = db.createObjectStore('products', { keyPath: 'id' });
          productStore.createIndex('by-name', 'name');
        }

        // Stock movements store
        if (!db.objectStoreNames.contains('stock_movements')) {
          const movementStore = db.createObjectStore('stock_movements', { keyPath: 'id' });
          movementStore.createIndex('by-product', 'productId');
          movementStore.createIndex('by-date', 'date');
        }

        // Sales store
        if (!db.objectStoreNames.contains('sales')) {
          const saleStore = db.createObjectStore('sales', { keyPath: 'id' });
          saleStore.createIndex('by-date', 'date');
          saleStore.createIndex('by-customer', 'customerId');
        }

        // Customers store
        if (!db.objectStoreNames.contains('customers')) {
          const customerStore = db.createObjectStore('customers', { keyPath: 'id' });
          customerStore.createIndex('by-name', 'name');
        }

        // Credit payments store
        if (!db.objectStoreNames.contains('credit_payments')) {
          const paymentStore = db.createObjectStore('credit_payments', { keyPath: 'id' });
          paymentStore.createIndex('by-customer', 'customerId');
          paymentStore.createIndex('by-date', 'date');
        }

        // Settings store
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'shopName' });
        }
      },
    });
  }
  return dbPromise;
}

/**
 * Initialisation de la base : AUCUN produit, client ou boutique fictive n'est injecté automatiquement.
 * Si aucune boutique n'est configurée, l'écran "Créer ma boutique" est affiché.
 */
export async function initDatabase(): Promise<void> {
  await getDB();
}

// ----------------- PARAMÈTRES BOUTIQUE & AUTH -----------------

export async function getShopSettings(): Promise<ShopSettings | null> {
  const db = await getDB();
  const list = await db.getAll('settings');
  if (list && list.length > 0 && list[0].isConfigured) {
    return list[0];
  }
  return null;
}

export async function createShopSettings(data: {
  shopName: string;
  shopOwner: string;
  phone: string;
  address: string;
  pin: string;
}): Promise<ShopSettings> {
  const db = await getDB();
  const salt = generateSalt();
  const pinHash = await hashPin(data.pin, salt);
  const now = new Date().toISOString();

  const settings: ShopSettings = {
    shopName: data.shopName.trim(),
    shopOwner: data.shopOwner.trim(),
    phone: data.phone.trim(),
    address: data.address.trim(),
    currency: 'GNF',
    pinHash,
    pinSalt: salt,
    isConfigured: true,
    createdAt: now,
    updatedAt: now,
  };

  const tx = db.transaction('settings', 'readwrite');
  await tx.store.clear();
  await tx.store.put(settings);
  await tx.done;

  return settings;
}

export async function updateShopSettings(data: {
  shopName: string;
  shopOwner: string;
  phone: string;
  address: string;
}): Promise<ShopSettings> {
  const db = await getDB();
  const current = await getShopSettings();
  if (!current) throw new Error('Boutique non configurée');

  const updated: ShopSettings = {
    ...current,
    shopName: data.shopName.trim(),
    shopOwner: data.shopOwner.trim(),
    phone: data.phone.trim(),
    address: data.address.trim(),
    updatedAt: new Date().toISOString(),
  };

  const tx = db.transaction('settings', 'readwrite');
  await tx.store.clear();
  await tx.store.put(updated);
  await tx.done;

  return updated;
}

export async function changeShopPin(oldPin: string, newPin: string): Promise<boolean> {
  const current = await getShopSettings();
  if (!current || !current.pinHash || !current.pinSalt) {
    throw new Error('Code PIN non configuré');
  }

  const isValid = await verifyPin(oldPin, current.pinSalt, current.pinHash);
  if (!isValid) {
    return false;
  }

  const newSalt = generateSalt();
  const newHash = await hashPin(newPin, newSalt);

  const updated: ShopSettings = {
    ...current,
    pinHash: newHash,
    pinSalt: newSalt,
    updatedAt: new Date().toISOString(),
  };

  const db = await getDB();
  const tx = db.transaction('settings', 'readwrite');
  await tx.store.clear();
  await tx.store.put(updated);
  await tx.done;

  return true;
}

export async function checkPin(pin: string): Promise<boolean> {
  const current = await getShopSettings();
  if (!current || !current.pinHash || !current.pinSalt) {
    return false;
  }
  return verifyPin(pin, current.pinSalt, current.pinHash);
}

// ----------------- STOCK & PRODUITS -----------------

export async function getAllProducts(): Promise<Product[]> {
  const db = await getDB();
  return db.getAll('products');
}

export async function getProductById(id: string): Promise<Product | undefined> {
  const db = await getDB();
  return db.get('products', id);
}

export async function getAllStockMovements(): Promise<StockMovement[]> {
  const db = await getDB();
  return db.getAll('stock_movements');
}

export async function getMovementsForProduct(productId: string): Promise<StockMovement[]> {
  const db = await getDB();
  return db.getAllFromIndex('stock_movements', 'by-product', productId);
}

/**
 * Calcul dynamique du stock : le stock est toujours la somme des mouvements en UNITÉS.
 */
export async function getProductsWithStock(): Promise<ProductWithStock[]> {
  const db = await getDB();
  const [products, movements] = await Promise.all([
    db.getAll('products'),
    db.getAll('stock_movements'),
  ]);

  const stockMap = new Map<string, number>();
  for (const mov of movements) {
    const current = stockMap.get(mov.productId) || 0;
    stockMap.set(mov.productId, current + mov.quantity);
  }

  return products.map((prod) => {
    const currentStock = stockMap.get(prod.id) || 0;
    return {
      ...prod,
      currentStock,
      isLowStock: currentStock <= prod.alertThreshold,
    };
  });
}

export async function createProduct(
  productData: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>,
  initialUnits: number
): Promise<Product> {
  const db = await getDB();
  const id = `prod-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const now = new Date().toISOString();

  const newProduct: Product = {
    ...productData,
    id,
    createdAt: now,
    updatedAt: now,
  };

  const tx = db.transaction(['products', 'stock_movements'], 'readwrite');
  await tx.objectStore('products').add(newProduct);

  if (initialUnits > 0) {
    const initialMovement: StockMovement = {
      id: `mov-${Date.now()}`,
      productId: id,
      type: 'initial',
      quantity: Math.max(0, initialUnits),
      reason: 'Stock de départ',
      date: now,
    };
    await tx.objectStore('stock_movements').add(initialMovement);
  }

  await tx.done;
  return newProduct;
}

export async function updateProduct(
  id: string,
  updates: Partial<Omit<Product, 'id' | 'createdAt'>>
): Promise<Product> {
  const db = await getDB();
  const current = await db.get('products', id);
  if (!current) throw new Error('Produit introuvable');

  const updated: Product = {
    ...current,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  await db.put('products', updated);
  return updated;
}

export async function deleteProduct(productId: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['products', 'stock_movements'], 'readwrite');
  await tx.objectStore('products').delete(productId);
  const index = tx.objectStore('stock_movements').index('by-product');
  let cursor = await index.openCursor(productId);
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}

/**
 * Réapprovisionnement de stock (en UNITÉS physiques)
 */
export async function addStockReappro(
  productId: string,
  unitsToAdd: number,
  note?: string
): Promise<StockMovement> {
  if (unitsToAdd <= 0) throw new Error('La quantité doit être supérieure à zéro');
  const db = await getDB();
  const movement: StockMovement = {
    id: `mov-reappro-${Date.now()}`,
    productId,
    type: 'reappro',
    quantity: Math.round(unitsToAdd),
    reason: 'Réapprovisionnement boutique',
    note,
    date: new Date().toISOString(),
  };

  await db.add('stock_movements', movement);
  return movement;
}

/**
 * Correction manuelle de stock (en UNITÉS physiques)
 */
export async function correctStock(
  productId: string,
  deltaUnits: number,
  reason: CorrectionReason,
  note?: string
): Promise<StockMovement> {
  if (deltaUnits === 0) throw new Error('La correction ne peut pas être nulle');
  const db = await getDB();
  const movement: StockMovement = {
    id: `mov-corr-${Date.now()}`,
    productId,
    type: 'correction',
    quantity: Math.round(deltaUnits),
    reason,
    note,
    date: new Date().toISOString(),
  };

  await db.add('stock_movements', movement);
  return movement;
}

// ----------------- VENTES & CAISSE -----------------

export async function recordSale(saleData: {
  items: Array<{
    product: Product;
    quantity: number;
    unitPrice: number;
    unitType: UnitType;
    packSize?: number;
    packLabel?: string;
  }>;
  paymentType: 'cash' | 'credit';
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  notes?: string;
}): Promise<Sale> {
  const db = await getDB();
  const saleId = `sale-${Date.now()}`;
  const now = new Date().toISOString();

  let totalAmount = 0;
  const saleItems: SaleItem[] = saleData.items.map((item) => {
    const total = item.quantity * item.unitPrice;
    totalAmount += total;
    return {
      productId: item.product.id,
      productName: item.product.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      total,
      unitType: item.unitType,
      packSize: item.packSize,
      packLabel: item.packLabel,
    };
  });

  const sale: Sale = {
    id: saleId,
    date: now,
    items: saleItems,
    totalAmount,
    paymentType: saleData.paymentType,
    customerId: saleData.customerId,
    customerName: saleData.customerName,
    customerPhone: saleData.customerPhone,
    notes: saleData.notes,
  };

  const tx = db.transaction(['sales', 'stock_movements'], 'readwrite');
  await tx.objectStore('sales').add(sale);

  // Pour chaque ligne de vente, déduire le nombre exact d'unités physiques :
  // Si carton/pack : quantité * packSize. Si unité : quantité.
  for (const item of saleItems) {
    const unitsToDeduct =
      item.unitType === 'pack' ? item.quantity * (item.packSize || 1) : item.quantity;

    const movement: StockMovement = {
      id: `mov-sale-${saleId}-${item.productId}-${item.unitType}-${Date.now()}`,
      productId: item.productId,
      type: 'vente',
      quantity: -Math.abs(unitsToDeduct),
      reason:
        item.unitType === 'pack'
          ? `Vente ${item.quantity} ${item.packLabel || 'carton'}(s) de ${item.packSize} unités`
          : `Vente ${item.quantity} unité(s)`,
      saleId,
      date: now,
    };
    await tx.objectStore('stock_movements').add(movement);
  }

  await tx.done;
  return sale;
}

export async function getAllSales(): Promise<Sale[]> {
  const db = await getDB();
  return db.getAll('sales');
}

// ----------------- CLIENTS & CRÉDITS -----------------

export async function getAllCustomers(): Promise<Customer[]> {
  const db = await getDB();
  return db.getAll('customers');
}

export async function createCustomer(customerData: {
  name: string;
  phone: string;
  address?: string;
  note?: string;
}): Promise<Customer> {
  const db = await getDB();
  const id = `cust-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const now = new Date().toISOString();

  const customer: Customer = {
    id,
    name: customerData.name.trim(),
    phone: customerData.phone.trim(),
    address: customerData.address?.trim(),
    note: customerData.note?.trim(),
    createdAt: now,
    updatedAt: now,
  };

  await db.add('customers', customer);
  return customer;
}

export async function updateCustomer(
  id: string,
  updates: Partial<Omit<Customer, 'id' | 'createdAt'>>
): Promise<Customer> {
  const db = await getDB();
  const current = await db.get('customers', id);
  if (!current) throw new Error('Client introuvable');

  const updated: Customer = {
    ...current,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  await db.put('customers', updated);
  return updated;
}

export async function deleteCustomer(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('customers', id);
}

export async function getCustomersWithBalance(): Promise<CustomerWithBalance[]> {
  const db = await getDB();
  const [customers, sales, payments] = await Promise.all([
    db.getAll('customers'),
    db.getAll('sales'),
    db.getAll('credit_payments'),
  ]);

  const creditPurchasesMap = new Map<string, { total: number; lastDate?: string }>();
  for (const sale of sales) {
    if (sale.paymentType === 'credit' && sale.customerId) {
      const current = creditPurchasesMap.get(sale.customerId) || { total: 0 };
      current.total += sale.totalAmount;
      if (!current.lastDate || sale.date > current.lastDate) {
        current.lastDate = sale.date;
      }
      creditPurchasesMap.set(sale.customerId, current);
    }
  }

  const paymentsMap = new Map<string, number>();
  for (const pay of payments) {
    const current = paymentsMap.get(pay.customerId) || 0;
    paymentsMap.set(pay.customerId, current + pay.amount);
  }

  return customers.map((c) => {
    const creditInfo = creditPurchasesMap.get(c.id) || { total: 0 };
    const totalPayments = paymentsMap.get(c.id) || 0;
    const currentDebt = Math.max(0, creditInfo.total - totalPayments);

    return {
      ...c,
      totalCreditPurchases: creditInfo.total,
      totalPayments,
      currentDebt,
      lastPurchaseDate: creditInfo.lastDate,
    };
  });
}

export async function recordCreditPayment(
  customerId: string,
  customerName: string,
  amount: number,
  note?: string
): Promise<CreditPayment> {
  if (amount <= 0) throw new Error('Le montant du paiement doit être supérieur à zéro');
  const db = await getDB();
  const payment: CreditPayment = {
    id: `pay-${Date.now()}`,
    customerId,
    customerName,
    amount: Math.round(amount),
    date: new Date().toISOString(),
    note,
  };

  await db.add('credit_payments', payment);
  return payment;
}

export async function getCreditPaymentsForCustomer(customerId: string): Promise<CreditPayment[]> {
  const db = await getDB();
  return db.getAllFromIndex('credit_payments', 'by-customer', customerId);
}

export async function getAllCreditPayments(): Promise<CreditPayment[]> {
  const db = await getDB();
  return db.getAll('credit_payments');
}

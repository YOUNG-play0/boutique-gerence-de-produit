import { openDB, DBSchema, IDBPDatabase } from 'idb';
import {
  Product,
  StockMovement,
  Sale,
  SaleItem,
  Customer,
  CreditPayment,
  CustomerDebtEntry,
  CustomerDebtType,
  ProductWithStock,
  CustomerWithBalance,
  ShopSettings,
  StockMovementType,
  StockSupport,
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
  customer_debts: {
    key: string;
    value: CustomerDebtEntry;
    indexes: { 'by-customer': string; 'by-date': string };
  };
  settings: {
    key: string;
    value: ShopSettings;
  };
}

const DB_NAME = 'boutique_guinee_db';
const DB_VERSION = 2;

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

        // Customer manual & initial debts store (sans vente)
        if (!db.objectStoreNames.contains('customer_debts')) {
          const debtStore = db.createObjectStore('customer_debts', { keyPath: 'id' });
          debtStore.createIndex('by-customer', 'customerId');
          debtStore.createIndex('by-date', 'date');
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

// ----------------- STOCK & PRODUITS (DEUX STOCKS SÉPARÉS) -----------------

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
 * Calcul dynamique des deux stocks séparés :
 * - stockUnits : somme des mouvements où support === 'unit' (ou undefined pour l'historique)
 * - stockPacks : somme des mouvements où support === 'pack'
 */
export async function getProductsWithStock(): Promise<ProductWithStock[]> {
  const db = await getDB();
  const [products, movements] = await Promise.all([
    db.getAll('products'),
    db.getAll('stock_movements'),
  ]);

  const unitsMap = new Map<string, number>();
  const packsMap = new Map<string, number>();

  for (const mov of movements) {
    const support: StockSupport = mov.support || 'unit';
    if (support === 'pack') {
      const cur = packsMap.get(mov.productId) || 0;
      packsMap.set(mov.productId, cur + mov.quantity);
    } else {
      const cur = unitsMap.get(mov.productId) || 0;
      unitsMap.set(mov.productId, cur + mov.quantity);
    }
  }

  return products.map((prod) => {
    const stockUnits = unitsMap.get(prod.id) || 0;
    const stockPacks = packsMap.get(prod.id) || 0;

    const hasPack = !!(prod.packSize && prod.packSize >= 2);
    const currentStock = stockUnits + (hasPack ? stockPacks * prod.packSize! : 0);

    const isLowStockUnits = stockUnits <= prod.alertThreshold;
    const isLowStockPacks = hasPack && prod.alertThresholdPacks !== undefined
      ? stockPacks <= prod.alertThresholdPacks
      : false;

    return {
      ...prod,
      stockUnits,
      stockPacks,
      currentStock,
      isLowStockUnits,
      isLowStockPacks,
      isLowStock: isLowStockUnits || isLowStockPacks,
    };
  });
}

export async function createProduct(
  productData: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>,
  initialStock: { units: number; packs?: number }
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

  if (initialStock.units > 0) {
    const unitMovement: StockMovement = {
      id: `mov-${Date.now()}-unit`,
      productId: id,
      type: 'initial',
      support: 'unit',
      quantity: Math.max(0, initialStock.units),
      reason: 'Stock de départ (unités seules)',
      date: now,
    };
    await tx.objectStore('stock_movements').add(unitMovement);
  }

  if (initialStock.packs && initialStock.packs > 0) {
    const packMovement: StockMovement = {
      id: `mov-${Date.now()}-pack`,
      productId: id,
      type: 'initial',
      support: 'pack',
      quantity: Math.max(0, initialStock.packs),
      reason: 'Stock de départ (cartons fermés)',
      date: now,
    };
    await tx.objectStore('stock_movements').add(packMovement);
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
 * OUVRIR UN CARTON :
 * Déclenche deux mouvements liés :
 * -1 carton fermé (support: 'pack')
 * +packSize unités seules (support: 'unit')
 */
export async function openPack(productId: string): Promise<{ packMovement: StockMovement; unitMovement: StockMovement }> {
  const db = await getDB();
  const product = await db.get('products', productId);
  if (!product) throw new Error('Produit introuvable');
  if (!product.packSize || product.packSize < 2) {
    throw new Error("Ce produit n'a pas de format carton");
  }

  const movements = await db.getAllFromIndex('stock_movements', 'by-product', productId);
  let packs = 0;
  for (const m of movements) {
    if (m.support === 'pack') packs += m.quantity;
  }
  if (packs < 1) {
    throw new Error('Aucun carton fermé disponible à ouvrir');
  }

  const now = new Date().toISOString();
  const label = product.packLabel || 'carton';

  const packMovement: StockMovement = {
    id: `mov-open-pack-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    productId,
    type: 'ouverture',
    support: 'pack',
    quantity: -1,
    reason: `Ouverture de 1 ${label} fermé`,
    date: now,
  };

  const unitMovement: StockMovement = {
    id: `mov-open-unit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    productId,
    type: 'ouverture',
    support: 'unit',
    quantity: product.packSize,
    reason: `Déballage de ${product.packSize} unités seules (+${product.packSize})`,
    date: now,
  };

  const tx = db.transaction('stock_movements', 'readwrite');
  await tx.store.add(packMovement);
  await tx.store.add(unitMovement);
  await tx.done;

  return { packMovement, unitMovement };
}

/**
 * Réapprovisionnement de stock (séparé pour cartons fermés ou unités seules)
 */
export async function addStockReappro(
  productId: string,
  quantity: number,
  support: StockSupport = 'unit',
  note?: string
): Promise<StockMovement> {
  if (quantity <= 0) throw new Error('La quantité doit être supérieure à zéro');
  const db = await getDB();
  const movement: StockMovement = {
    id: `mov-reappro-${Date.now()}`,
    productId,
    type: 'reappro',
    support,
    quantity: Math.round(quantity),
    reason: support === 'pack' ? 'Réapprovisionnement cartons fermés' : 'Réapprovisionnement unités seules',
    note,
    date: new Date().toISOString(),
  };

  await db.add('stock_movements', movement);
  return movement;
}

/**
 * Correction manuelle de stock (séparée pour cartons fermés ou unités seules)
 */
export async function correctStock(
  productId: string,
  delta: number,
  support: StockSupport = 'unit',
  reason: CorrectionReason,
  note?: string
): Promise<StockMovement> {
  if (delta === 0) throw new Error('La correction ne peut pas être nulle');
  const db = await getDB();
  const movement: StockMovement = {
    id: `mov-corr-${Date.now()}`,
    productId,
    type: 'correction',
    support,
    quantity: Math.round(delta),
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

  // Une ligne unité retire du stock d'unités seules (support: 'unit').
  // Une ligne carton retire du stock de cartons fermés (support: 'pack').
  for (const item of saleItems) {
    const support: StockSupport = item.unitType === 'pack' ? 'pack' : 'unit';
    const movement: StockMovement = {
      id: `mov-sale-${saleId}-${item.productId}-${support}-${Date.now()}`,
      productId: item.productId,
      type: 'vente',
      support,
      quantity: -Math.abs(item.quantity),
      reason:
        support === 'pack'
          ? `Vente ${item.quantity} ${item.packLabel || 'carton'}(s) fermé(s)`
          : `Vente ${item.quantity} unité(s) seule(s)`,
      saleId,
      date: now,
    };
    await tx.objectStore('stock_movements').add(movement);
  }

  await tx.done;
  return sale;
}

/**
 * Annulation d'une vente : réinjecte le bon type de stock (carton ou unité) via des mouvements inverses
 */
export async function cancelSale(saleId: string): Promise<Sale> {
  const db = await getDB();
  const sale = await db.get('sales', saleId);
  if (!sale) throw new Error('Vente introuvable');
  if (sale.isCancelled) throw new Error('Cette vente a déjà été annulée');

  const now = new Date().toISOString();
  sale.isCancelled = true;

  const tx = db.transaction(['sales', 'stock_movements'], 'readwrite');
  await tx.objectStore('sales').put(sale);

  for (const item of sale.items) {
    const support: StockSupport = item.unitType === 'pack' ? 'pack' : 'unit';
    const movement: StockMovement = {
      id: `mov-cancel-${saleId}-${item.productId}-${support}-${Date.now()}`,
      productId: item.productId,
      type: 'annulation',
      support,
      quantity: Math.abs(item.quantity),
      reason: `Annulation vente (${support === 'pack' ? 'cartons' : 'unités'})`,
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

export async function getSalesForCustomer(customerId: string): Promise<Sale[]> {
  const db = await getDB();
  return db.getAllFromIndex('sales', 'by-customer', customerId);
}

// ----------------- CLIENTS & CRÉDITS -----------------

export async function getAllCustomers(): Promise<Customer[]> {
  const db = await getDB();
  return db.getAll('customers');
}

export async function createCustomer(
  customerData: {
    name: string;
    phone: string;
    address?: string;
    note?: string;
  },
  initialDebt?: number
): Promise<{ customer: Customer; initialDebtEntry?: CustomerDebtEntry }> {
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

  const tx = db.transaction(['customers', 'customer_debts'], 'readwrite');
  await tx.objectStore('customers').add(customer);

  let initialDebtEntry: CustomerDebtEntry | undefined;
  if (initialDebt && initialDebt > 0) {
    initialDebtEntry = {
      id: `debt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      customerId: id,
      customerName: customer.name,
      amount: Math.round(initialDebt),
      type: 'dette_initiale',
      date: now,
      note: 'Ancienne dette (carnet)',
      isCancelled: false,
    };
    await tx.objectStore('customer_debts').add(initialDebtEntry);
  }

  await tx.done;
  return { customer, initialDebtEntry };
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
  const tx = db.transaction(['customers', 'credit_payments', 'customer_debts'], 'readwrite');
  await tx.objectStore('customers').delete(id);

  // Supprimer également les paiements et dettes liés au client
  const payIndex = tx.objectStore('credit_payments').index('by-customer');
  let payCursor = await payIndex.openCursor(id);
  while (payCursor) {
    await payCursor.delete();
    payCursor = await payCursor.continue();
  }

  const debtIndex = tx.objectStore('customer_debts').index('by-customer');
  let debtCursor = await debtIndex.openCursor(id);
  while (debtCursor) {
    await debtCursor.delete();
    debtCursor = await debtCursor.continue();
  }

  await tx.done;
}

export async function getCustomersWithBalance(): Promise<CustomerWithBalance[]> {
  const db = await getDB();
  const [customers, sales, payments, debts] = await Promise.all([
    db.getAll('customers'),
    db.getAll('sales'),
    db.getAll('credit_payments'),
    db.getAll('customer_debts'),
  ]);

  const creditPurchasesMap = new Map<string, { total: number; lastDate?: string }>();
  for (const sale of sales) {
    if (!sale.isCancelled && sale.paymentType === 'credit' && sale.customerId) {
      const current = creditPurchasesMap.get(sale.customerId) || { total: 0 };
      current.total += sale.totalAmount;
      if (!current.lastDate || sale.date > current.lastDate) {
        current.lastDate = sale.date;
      }
      creditPurchasesMap.set(sale.customerId, current);
    }
  }

  // Dettes manuelles et initiales (non annulées)
  const manualDebtsMap = new Map<string, { total: number; lastDate?: string }>();
  for (const debt of debts) {
    if (!debt.isCancelled && debt.customerId) {
      const current = manualDebtsMap.get(debt.customerId) || { total: 0 };
      current.total += debt.amount;
      if (!current.lastDate || debt.date > current.lastDate) {
        current.lastDate = debt.date;
      }
      manualDebtsMap.set(debt.customerId, current);
    }
  }

  const paymentsMap = new Map<string, number>();
  for (const pay of payments) {
    const current = paymentsMap.get(pay.customerId) || 0;
    paymentsMap.set(pay.customerId, current + pay.amount);
  }

  return customers.map((c) => {
    const creditInfo = creditPurchasesMap.get(c.id) || { total: 0 };
    const manualDebtInfo = manualDebtsMap.get(c.id) || { total: 0 };
    const totalPayments = paymentsMap.get(c.id) || 0;

    const totalDebts = creditInfo.total + manualDebtInfo.total;
    const currentDebt = Math.max(0, totalDebts - totalPayments);

    // Dernière date entre achats à crédit et dettes manuelles
    let lastDate = creditInfo.lastDate;
    if (manualDebtInfo.lastDate && (!lastDate || manualDebtInfo.lastDate > lastDate)) {
      lastDate = manualDebtInfo.lastDate;
    }

    return {
      ...c,
      totalCreditPurchases: creditInfo.total,
      totalManualDebts: manualDebtInfo.total,
      totalDebts,
      totalPayments,
      currentDebt,
      lastPurchaseDate: lastDate,
    };
  });
}

// ----------------- DETTES SANS VENTE (MANUELLES & INITIALES) -----------------

export async function addCustomerDebt(data: {
  customerId: string;
  customerName: string;
  amount: number;
  type?: CustomerDebtType;
  date?: string;
  note?: string;
}): Promise<CustomerDebtEntry> {
  if (data.amount <= 0) {
    throw new Error('Le montant de la dette doit être supérieur à zéro');
  }
  const db = await getDB();
  const debtEntry: CustomerDebtEntry = {
    id: `debt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    customerId: data.customerId,
    customerName: data.customerName,
    amount: Math.round(data.amount),
    type: data.type || 'dette_manuelle',
    date: data.date || new Date().toISOString(),
    note: data.note?.trim() || undefined,
    isCancelled: false,
  };

  await db.add('customer_debts', debtEntry);
  return debtEntry;
}

export async function cancelCustomerDebt(debtId: string): Promise<CustomerDebtEntry> {
  const db = await getDB();
  const debt = await db.get('customer_debts', debtId);
  if (!debt) throw new Error('Dette introuvable');
  if (debt.isCancelled) throw new Error('Cette dette est déjà annulée');

  debt.isCancelled = true;
  await db.put('customer_debts', debt);
  return debt;
}

export async function getDebtsForCustomer(customerId: string): Promise<CustomerDebtEntry[]> {
  const db = await getDB();
  return db.getAllFromIndex('customer_debts', 'by-customer', customerId);
}

export async function getAllCustomerDebts(): Promise<CustomerDebtEntry[]> {
  const db = await getDB();
  return db.getAll('customer_debts');
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

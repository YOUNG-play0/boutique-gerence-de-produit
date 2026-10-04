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
  AssistantConversation,
  StockMovementType,
  StockSupport,
  CorrectionReason,
  UnitType,
} from '../types';
import { generateSalt, hashPin, verifyPin, generateUUID } from '../utils/crypto';

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
  conversations: {
    key: string;
    value: AssistantConversation;
    indexes: { 'by-date': string };
  };
  settings: {
    key: string;
    value: ShopSettings;
  };
}

const DB_NAME = 'boutique_guinee_db';
const DB_VERSION = 3;

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

        // Customer manual & initial debts store
        if (!db.objectStoreNames.contains('customer_debts')) {
          const debtStore = db.createObjectStore('customer_debts', { keyPath: 'id' });
          debtStore.createIndex('by-customer', 'customerId');
          debtStore.createIndex('by-date', 'date');
        }

        // Assistant conversations store
        if (!db.objectStoreNames.contains('conversations')) {
          const convStore = db.createObjectStore('conversations', { keyPath: 'id' });
          convStore.createIndex('by-date', 'date');
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
 * Demande de stockage persistant auprès du navigateur (Point B.8)
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
    try {
      const isPersisted = await navigator.storage.persisted();
      if (!isPersisted) {
        return await navigator.storage.persist();
      }
      return isPersisted;
    } catch (e) {
      console.warn('Erreur stockage persistant:', e);
      return false;
    }
  }
  return false;
}

/**
 * Initialisation de la base de données avec gestion des erreurs et intégrité du stock (Point B.9 & C.13)
 */
export async function initDatabase(): Promise<void> {
  try {
    await getDB();
    await requestPersistentStorage();
    await verifyStockIntegrity();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('QuotaExceeded') || msg.includes('quota')) {
      throw new Error("L'espace de stockage de votre appareil est saturé. Veuillez libérer de la mémoire.");
    }
    if (msg.includes('blocked') || msg.includes('VersionError')) {
      throw new Error("La base locale est bloquée par un autre onglet. Fermez les autres onglets et réessayez.");
    }
    throw new Error(`Impossible d'initialiser les données de la boutique (${msg}). Vos données restent en sécurité.`);
  }
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

// ----------------- STOCK & PRODUITS (COMPTEURS & INTÉGRITÉ - POINT C.13) -----------------

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
 * Vérification et synchronisation d'intégrité entre mouvements historiques et compteurs persistants
 * Garantit qu'aucun stock n'est erroné ou désynchronisé (Point C.13 & A.1)
 */
export async function verifyStockIntegrity(): Promise<{
  checkedProducts: number;
  fixedProducts: number;
}> {
  const db = await getDB();
  const tx = db.transaction(['products', 'stock_movements'], 'readwrite');
  const productStore = tx.objectStore('products');
  const movementStore = tx.objectStore('stock_movements');

  const products = await productStore.getAll();
  const movements = await movementStore.getAll();

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

  let fixedProducts = 0;

  for (const prod of products) {
    const calculatedUnits = unitsMap.get(prod.id) || 0;
    const calculatedPacks = packsMap.get(prod.id) || 0;

    const actualUnits = Math.max(0, calculatedUnits);
    const actualPacks = Math.max(0, calculatedPacks);

    if (prod.stockUnits !== actualUnits || prod.stockPacks !== actualPacks) {
      prod.stockUnits = actualUnits;
      prod.stockPacks = actualPacks;
      await productStore.put(prod);
      fixedProducts += 1;
    }
  }

  await tx.done;
  return { checkedProducts: products.length, fixedProducts };
}

/**
 * Récupération ultra-rapide des stocks depuis les compteurs directs, sans itérer sur l'historique complet
 */
export async function getProductsWithStock(): Promise<ProductWithStock[]> {
  const db = await getDB();
  const products = await db.getAll('products');

  const needsInit = products.some((p) => p.stockUnits === undefined || p.stockPacks === undefined);
  if (needsInit) {
    await verifyStockIntegrity();
    const refreshed = await db.getAll('products');
    return mapProductsWithStock(refreshed);
  }

  return mapProductsWithStock(products);
}

function mapProductsWithStock(products: Product[]): ProductWithStock[] {
  return products.map((prod) => {
    const stockUnits = Math.max(0, prod.stockUnits ?? 0);
    const stockPacks = Math.max(0, prod.stockPacks ?? 0);
    const hasPack = !!(prod.packSize && prod.packSize >= 2);
    const currentStock = stockUnits + (hasPack ? stockPacks * prod.packSize! : 0);

    const isLowStockUnits = stockUnits <= prod.alertThreshold;
    const isLowStockPacks =
      hasPack && prod.alertThresholdPacks !== undefined
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
  productData: Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'stockUnits' | 'stockPacks'>,
  initialStock: { units: number; packs?: number }
): Promise<Product> {
  if (!productData.name || !productData.name.trim()) {
    throw new Error('Le nom du produit est obligatoire.');
  }
  if (productData.price === undefined || productData.price <= 0 || productData.price > 100_000_000) {
    throw new Error("Le prix unitaire doit être compris entre 1 et 100 000 000 GNF.");
  }
  if (productData.packSize && (productData.packSize < 2 || productData.packSize > 10_000)) {
    throw new Error("Le nombre d'unités par carton doit être compris entre 2 et 10 000.");
  }
  if (productData.packPrice && (productData.packPrice <= 0 || productData.packPrice > 100_000_000)) {
    throw new Error("Le prix du carton doit être compris entre 1 et 100 000 000 GNF.");
  }

  const cleanUnits = Math.max(0, Math.round(initialStock.units || 0));
  const cleanPacks = Math.max(0, Math.round(initialStock.packs || 0));

  const db = await getDB();
  const id = `prod-${generateUUID()}`;
  const now = new Date().toISOString();

  const newProduct: Product = {
    ...productData,
    name: productData.name.trim(),
    price: Math.round(productData.price),
    packPrice: productData.packPrice ? Math.round(productData.packPrice) : undefined,
    id,
    stockUnits: cleanUnits,
    stockPacks: cleanPacks,
    createdAt: now,
    updatedAt: now,
  };

  const tx = db.transaction(['products', 'stock_movements'], 'readwrite');
  await tx.objectStore('products').add(newProduct);

  if (cleanUnits > 0) {
    const unitMovement: StockMovement = {
      id: `mov-${generateUUID()}`,
      productId: id,
      type: 'initial',
      support: 'unit',
      quantity: cleanUnits,
      reason: 'Stock de départ (unités seules)',
      date: now,
    };
    await tx.objectStore('stock_movements').add(unitMovement);
  }

  if (cleanPacks > 0) {
    const packMovement: StockMovement = {
      id: `mov-${generateUUID()}`,
      productId: id,
      type: 'initial',
      support: 'pack',
      quantity: cleanPacks,
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

  if (updates.name !== undefined && !updates.name.trim()) {
    throw new Error('Le nom du produit ne peut pas être vide.');
  }
  if (updates.price !== undefined && (updates.price <= 0 || updates.price > 100_000_000)) {
    throw new Error("Le prix unitaire doit être compris entre 1 et 100 000 000 GNF.");
  }
  if (updates.packPrice !== undefined && updates.packPrice !== null && (updates.packPrice <= 0 || updates.packPrice > 100_000_000)) {
    throw new Error("Le prix du carton doit être compris entre 1 et 100 000 000 GNF.");
  }
  if (updates.packSize !== undefined && updates.packSize !== null && (updates.packSize < 2 || updates.packSize > 10_000)) {
    throw new Error("Le nombre d'unités par carton doit être compris entre 2 et 10 000.");
  }

  const updated: Product = {
    ...current,
    ...updates,
    price: updates.price ? Math.round(updates.price) : current.price,
    packPrice: updates.packPrice ? Math.round(updates.packPrice) : current.packPrice,
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
 * Transaction atomique :
 * Vérifie stockPacks >= 1
 * -1 carton fermé, +packSize unités seules (Point A.1 & A.2)
 */
export async function openPack(productId: string): Promise<{ packMovement: StockMovement; unitMovement: StockMovement }> {
  const db = await getDB();
  const tx = db.transaction(['products', 'stock_movements'], 'readwrite');
  const productStore = tx.objectStore('products');
  const movementStore = tx.objectStore('stock_movements');

  const product = await productStore.get(productId);
  if (!product) throw new Error('Produit introuvable');
  if (!product.packSize || product.packSize < 2) {
    throw new Error("Ce produit n'a pas de format carton");
  }

  const currentPacks = product.stockPacks ?? 0;
  if (currentPacks < 1) {
    throw new Error('Aucun carton fermé disponible à ouvrir.');
  }

  const now = new Date().toISOString();
  const label = product.packLabel || 'carton';

  // Mise à jour atomique des compteurs
  product.stockPacks = currentPacks - 1;
  product.stockUnits = (product.stockUnits ?? 0) + product.packSize;
  product.updatedAt = now;
  await productStore.put(product);

  const packMovement: StockMovement = {
    id: `mov-${generateUUID()}`,
    productId,
    type: 'ouverture',
    support: 'pack',
    quantity: -1,
    reason: `Ouverture de 1 ${label} fermé`,
    date: now,
  };

  const unitMovement: StockMovement = {
    id: `mov-${generateUUID()}`,
    productId,
    type: 'ouverture',
    support: 'unit',
    quantity: product.packSize,
    reason: `Déballage de ${product.packSize} unités seules (+${product.packSize})`,
    date: now,
  };

  await movementStore.add(packMovement);
  await movementStore.add(unitMovement);
  await tx.done;

  return { packMovement, unitMovement };
}

/**
 * Réapprovisionnement de stock atomique (séparé pour cartons fermés ou unités seules)
 */
export async function addStockReappro(
  productId: string,
  quantity: number,
  support: StockSupport = 'unit',
  note?: string
): Promise<StockMovement> {
  const roundedQty = Math.round(quantity);
  if (roundedQty <= 0) throw new Error('La quantité doit être un nombre supérieur à zéro.');
  if (roundedQty > 100_000) throw new Error('La quantité maximale autorisée est de 100 000.');

  const db = await getDB();
  const tx = db.transaction(['products', 'stock_movements'], 'readwrite');
  const productStore = tx.objectStore('products');
  const movementStore = tx.objectStore('stock_movements');

  const product = await productStore.get(productId);
  if (!product) throw new Error('Produit introuvable');

  const now = new Date().toISOString();
  if (support === 'pack') {
    product.stockPacks = (product.stockPacks ?? 0) + roundedQty;
  } else {
    product.stockUnits = (product.stockUnits ?? 0) + roundedQty;
  }
  product.updatedAt = now;
  await productStore.put(product);

  const movement: StockMovement = {
    id: `mov-${generateUUID()}`,
    productId,
    type: 'reappro',
    support,
    quantity: roundedQty,
    reason: support === 'pack' ? 'Réapprovisionnement cartons fermés' : 'Réapprovisionnement unités seules',
    note,
    date: now,
  };

  await movementStore.add(movement);
  await tx.done;

  return movement;
}

/**
 * Correction manuelle de stock atomique (empêche tout stock négatif - Point A.1)
 */
export async function correctStock(
  productId: string,
  delta: number,
  support: StockSupport = 'unit',
  reason: CorrectionReason,
  note?: string
): Promise<StockMovement> {
  const roundedDelta = Math.round(delta);
  if (roundedDelta === 0) throw new Error('La correction ne peut pas être nulle.');

  const db = await getDB();
  const tx = db.transaction(['products', 'stock_movements'], 'readwrite');
  const productStore = tx.objectStore('products');
  const movementStore = tx.objectStore('stock_movements');

  const product = await productStore.get(productId);
  if (!product) throw new Error('Produit introuvable');

  const currentStock = support === 'pack' ? (product.stockPacks ?? 0) : (product.stockUnits ?? 0);
  const newStock = currentStock + roundedDelta;

  if (newStock < 0) {
    const supportLabel = support === 'pack' ? (product.packLabel || 'carton') : 'unité';
    throw new Error(
      `Correction impossible : le stock de ${supportLabel}s deviendrait négatif (${newStock}). Stock actuel disponible : ${currentStock}.`
    );
  }

  const now = new Date().toISOString();
  if (support === 'pack') {
    product.stockPacks = newStock;
  } else {
    product.stockUnits = newStock;
  }
  product.updatedAt = now;
  await productStore.put(product);

  const movement: StockMovement = {
    id: `mov-${generateUUID()}`,
    productId,
    type: 'correction',
    support,
    quantity: roundedDelta,
    reason,
    note,
    date: now,
  };

  await movementStore.add(movement);
  await tx.done;

  return movement;
}

// ----------------- VENTES & CAISSE (TRANSACTION UNIQUE ATOMIQUE - POINT A.1 & A.2) -----------------

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
  if (!saleData.items || saleData.items.length === 0) {
    throw new Error('Le panier est vide.');
  }

  // Validation stricte des données avant écriture
  for (const item of saleData.items) {
    if (!item.quantity || item.quantity <= 0 || !Number.isInteger(item.quantity)) {
      throw new Error(`Quantité invalide pour « ${item.product.name} ». Veuillez saisir un nombre entier positif.`);
    }
    if (item.quantity > 100_000) {
      throw new Error(`Quantité excessive pour « ${item.product.name} » (maximum 100 000).`);
    }
    if (item.unitPrice < 0 || item.unitPrice > 100_000_000) {
      throw new Error(`Prix unitaire invalide pour « ${item.product.name} ».`);
    }
  }

  const db = await getDB();
  const saleId = `sale-${generateUUID()}`;
  const now = new Date().toISOString();

  let totalAmount = 0;
  const saleItems: SaleItem[] = saleData.items.map((item) => {
    const total = Math.round(item.quantity * item.unitPrice);
    totalAmount += total;
    return {
      productId: item.product.id,
      productName: item.product.name,
      quantity: item.quantity,
      unitPrice: Math.round(item.unitPrice),
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
    totalAmount: Math.round(totalAmount),
    paymentType: saleData.paymentType,
    customerId: saleData.customerId,
    customerName: saleData.customerName,
    customerPhone: saleData.customerPhone,
    notes: saleData.notes,
  };

  // Transaction atomique UNIQUE : ['sales', 'stock_movements', 'products']
  const tx = db.transaction(['sales', 'stock_movements', 'products'], 'readwrite');
  const productStore = tx.objectStore('products');
  const movementStore = tx.objectStore('stock_movements');
  const saleStore = tx.objectStore('sales');

  // Vérification de la disponibilité du stock dans la transaction (anti-stock négatif)
  for (const item of saleItems) {
    const prod = await productStore.get(item.productId);
    if (!prod) {
      throw new Error(`Le produit « ${item.productName} » n'existe plus dans la base de données.`);
    }

    const support: StockSupport = item.unitType === 'pack' ? 'pack' : 'unit';
    const currentStock = support === 'pack' ? (prod.stockPacks ?? 0) : (prod.stockUnits ?? 0);

    if (currentStock < item.quantity) {
      const typeLabel = support === 'pack' ? (prod.packLabel || 'carton') : 'unité';
      throw new Error(
        `Stock insuffisant pour « ${prod.name} » : ${currentStock} ${typeLabel}(s) disponible(s), ${item.quantity} demandé(s). Aucun stock négatif n'est autorisé.`
      );
    }

    // Décrémenter les compteurs directs du produit
    if (support === 'pack') {
      prod.stockPacks = currentStock - item.quantity;
    } else {
      prod.stockUnits = currentStock - item.quantity;
    }
    prod.updatedAt = now;
    await productStore.put(prod);

    // Enregistrer le mouvement de stock lié à la vente
    const movement: StockMovement = {
      id: `mov-${generateUUID()}`,
      productId: item.productId,
      type: 'vente',
      support,
      quantity: -item.quantity,
      reason:
        support === 'pack'
          ? `Vente ${item.quantity} ${item.packLabel || 'carton'}(s) fermé(s)`
          : `Vente ${item.quantity} unité(s) seule(s)`,
      saleId,
      date: now,
    };
    await movementStore.add(movement);
  }

  // Enregistrer la vente dans la même transaction
  await saleStore.add(sale);
  await tx.done;

  return sale;
}

/**
 * Annulation d'une vente : transaction atomique qui réinjecte le stock et marque la vente comme annulée (Point A.1, A.2, A.4)
 */
export async function cancelSale(saleId: string): Promise<Sale> {
  const db = await getDB();
  const tx = db.transaction(['sales', 'stock_movements', 'products'], 'readwrite');
  const saleStore = tx.objectStore('sales');
  const movementStore = tx.objectStore('stock_movements');
  const productStore = tx.objectStore('products');

  const sale = await saleStore.get(saleId);
  if (!sale) throw new Error('Vente introuvable.');
  if (sale.isCancelled) throw new Error('Cette vente a déjà été annulée.');

  const now = new Date().toISOString();
  sale.isCancelled = true;
  await saleStore.put(sale);

  for (const item of sale.items) {
    const support: StockSupport = item.unitType === 'pack' ? 'pack' : 'unit';
    const prod = await productStore.get(item.productId);
    if (prod) {
      if (support === 'pack') {
        prod.stockPacks = (prod.stockPacks ?? 0) + Math.abs(item.quantity);
      } else {
        prod.stockUnits = (prod.stockUnits ?? 0) + Math.abs(item.quantity);
      }
      prod.updatedAt = now;
      await productStore.put(prod);
    }

    const movement: StockMovement = {
      id: `mov-${generateUUID()}`,
      productId: item.productId,
      type: 'annulation',
      support,
      quantity: Math.abs(item.quantity),
      reason: `Annulation vente (${support === 'pack' ? 'cartons' : 'unités'})`,
      saleId,
      date: now,
    };
    await movementStore.add(movement);
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

// ----------------- CLIENTS & CRÉDITS (POINT A.4, A.6 & A.7) -----------------

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
  if (!customerData.name || !customerData.name.trim()) {
    throw new Error('Le nom du client est obligatoire.');
  }

  const cleanDebt = initialDebt && initialDebt > 0 ? Math.round(initialDebt) : undefined;
  if (cleanDebt && cleanDebt > 100_000_000) {
    throw new Error('Le montant de la dette initiale ne peut pas dépasser 100 000 000 GNF.');
  }

  const db = await getDB();
  const id = `cust-${generateUUID()}`;
  const now = new Date().toISOString();

  const customer: Customer = {
    id,
    name: customerData.name.trim(),
    phone: customerData.phone.trim(),
    address: customerData.address?.trim() || undefined,
    note: customerData.note?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  };

  const tx = db.transaction(['customers', 'customer_debts'], 'readwrite');
  await tx.objectStore('customers').add(customer);

  let initialDebtEntry: CustomerDebtEntry | undefined;
  if (cleanDebt && cleanDebt > 0) {
    initialDebtEntry = {
      id: `debt-${generateUUID()}`,
      customerId: id,
      customerName: customer.name,
      amount: cleanDebt,
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

  if (updates.name !== undefined && !updates.name.trim()) {
    throw new Error('Le nom du client ne peut pas être vide.');
  }

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

/**
 * Calcul exact du solde client :
 * Dette d'un client = dettes initiales/manuelles non annulées + ventes à crédit non annulées - paiements
 * (Point A.4)
 */
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
      current.total += Math.round(sale.totalAmount);
      if (!current.lastDate || sale.date > current.lastDate) {
        current.lastDate = sale.date;
      }
      creditPurchasesMap.set(sale.customerId, current);
    }
  }

  const manualDebtsMap = new Map<string, { total: number; lastDate?: string }>();
  for (const debt of debts) {
    if (!debt.isCancelled && debt.customerId) {
      const current = manualDebtsMap.get(debt.customerId) || { total: 0 };
      current.total += Math.round(debt.amount);
      if (!current.lastDate || debt.date > current.lastDate) {
        current.lastDate = debt.date;
      }
      manualDebtsMap.set(debt.customerId, current);
    }
  }

  const paymentsMap = new Map<string, number>();
  for (const pay of payments) {
    const current = paymentsMap.get(pay.customerId) || 0;
    paymentsMap.set(pay.customerId, current + Math.round(pay.amount));
  }

  return customers.map((c) => {
    const creditInfo = creditPurchasesMap.get(c.id) || { total: 0 };
    const manualDebtInfo = manualDebtsMap.get(c.id) || { total: 0 };
    const totalPayments = paymentsMap.get(c.id) || 0;

    const totalDebts = creditInfo.total + manualDebtInfo.total;
    const currentDebt = Math.max(0, totalDebts - totalPayments);

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
  const roundedAmount = Math.round(data.amount);
  if (!roundedAmount || roundedAmount <= 0) {
    throw new Error('Le montant de la dette doit être supérieur à zéro.');
  }
  if (roundedAmount > 100_000_000) {
    throw new Error('Le montant de la dette ne peut pas dépasser 100 000 000 GNF.');
  }

  const db = await getDB();
  const debtEntry: CustomerDebtEntry = {
    id: `debt-${generateUUID()}`,
    customerId: data.customerId,
    customerName: data.customerName,
    amount: roundedAmount,
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
  const roundedAmount = Math.round(amount);
  if (!roundedAmount || roundedAmount <= 0) {
    throw new Error('Le montant du paiement doit être supérieur à zéro.');
  }
  if (roundedAmount > 100_000_000) {
    throw new Error('Le montant du paiement ne peut pas dépasser 100 000 000 GNF.');
  }

  const db = await getDB();
  const payment: CreditPayment = {
    id: `pay-${generateUUID()}`,
    customerId,
    customerName,
    amount: roundedAmount,
    date: new Date().toISOString(),
    note: note?.trim() || undefined,
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

// ----------------- ASSISTANT IA - HISTORIQUE DES CONVERSATIONS -----------------

export async function getAllConversations(): Promise<AssistantConversation[]> {
  const db = await getDB();
  const list = await db.getAll('conversations');
  return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export async function getConversationById(id: string): Promise<AssistantConversation | undefined> {
  const db = await getDB();
  return db.get('conversations', id);
}

export async function getLastConversation(): Promise<AssistantConversation | null> {
  const all = await getAllConversations();
  return all.length > 0 ? all[0] : null;
}

export async function saveConversation(conv: AssistantConversation): Promise<AssistantConversation> {
  const db = await getDB();
  await db.put('conversations', conv);
  return conv;
}

export async function deleteConversation(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('conversations', id);
}

export async function clearAllConversations(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('conversations', 'readwrite');
  await tx.store.clear();
  await tx.done;
}

// ----------------- SAUVEGARDE & RESTAURATION (EXPORT / IMPORT - POINT B.10) -----------------

export interface BackupData {
  version: number;
  exportedAt: string;
  settings: ShopSettings[];
  products: Product[];
  stock_movements: StockMovement[];
  sales: Sale[];
  customers: Customer[];
  customer_debts: CustomerDebtEntry[];
  credit_payments: CreditPayment[];
  conversations: AssistantConversation[];
}

export async function generateBackupData(): Promise<{ backup: BackupData; jsonString: string; sizeBytes: number }> {
  const db = await getDB();
  const [
    settings,
    products,
    stock_movements,
    sales,
    customers,
    customer_debts,
    credit_payments,
    conversations,
  ] = await Promise.all([
    db.getAll('settings'),
    db.getAll('products'),
    db.getAll('stock_movements'),
    db.getAll('sales'),
    db.getAll('customers'),
    db.getAll('customer_debts'),
    db.getAll('credit_payments'),
    db.getAll('conversations'),
  ]);

  const backup: BackupData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    settings,
    products,
    stock_movements,
    sales,
    customers,
    customer_debts,
    credit_payments,
    conversations,
  };

  const jsonString = JSON.stringify(backup, null, 2);
  const sizeBytes = new Blob([jsonString]).size;
  return { backup, jsonString, sizeBytes };
}

export async function restoreBackupData(backup: unknown): Promise<void> {
  if (!backup || typeof backup !== 'object') {
    throw new Error('Fichier de sauvegarde invalide : format JSON attendu.');
  }

  const b = backup as Partial<BackupData>;
  if (!b.products && !b.settings && !b.sales) {
    throw new Error("Le fichier ne contient aucune donnée valide de l'application Boutique Guinée.");
  }

  const db = await getDB();
  const tx = db.transaction(
    [
      'settings',
      'products',
      'stock_movements',
      'sales',
      'customers',
      'customer_debts',
      'credit_payments',
      'conversations',
    ],
    'readwrite'
  );

  // Vider les stores avant de restaurer
  await Promise.all([
    tx.objectStore('settings').clear(),
    tx.objectStore('products').clear(),
    tx.objectStore('stock_movements').clear(),
    tx.objectStore('sales').clear(),
    tx.objectStore('customers').clear(),
    tx.objectStore('customer_debts').clear(),
    tx.objectStore('credit_payments').clear(),
    tx.objectStore('conversations').clear(),
  ]);

  if (Array.isArray(b.settings)) {
    for (const item of b.settings) await tx.objectStore('settings').put(item);
  }
  if (Array.isArray(b.products)) {
    for (const item of b.products) await tx.objectStore('products').put(item);
  }
  if (Array.isArray(b.stock_movements)) {
    for (const item of b.stock_movements) await tx.objectStore('stock_movements').put(item);
  }
  if (Array.isArray(b.sales)) {
    for (const item of b.sales) await tx.objectStore('sales').put(item);
  }
  if (Array.isArray(b.customers)) {
    for (const item of b.customers) await tx.objectStore('customers').put(item);
  }
  if (Array.isArray(b.customer_debts)) {
    for (const item of b.customer_debts) await tx.objectStore('customer_debts').put(item);
  }
  if (Array.isArray(b.credit_payments)) {
    for (const item of b.credit_payments) await tx.objectStore('credit_payments').put(item);
  }
  if (Array.isArray(b.conversations)) {
    for (const item of b.conversations) await tx.objectStore('conversations').put(item);
  }

  await tx.done;

  // Réajuster l'intégrité des compteurs de stock immédiatement après la restauration
  await verifyStockIntegrity();
}

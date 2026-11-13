import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  runTransaction,
  Timestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions, handleFirestoreError, OperationType } from '../firebase';
import {
  AppNotification,
  AuditLog,
  CartItem,
  Category,
  DeliveryStatus,
  DeliveryZone,
  Discount,
  EmailNotificationRecord,
  EmailNotificationType,
  EmailPreferencesSettings,
  InventoryChangeType,
  InventoryLog,
  Order,
  OrderAddressSnapshot,
  OrderCustomerSnapshot,
  OrderStatus,
  OrderStatusHistoryEntry,
  PaymentSubmission,
  Product,
  ProductReview,
  SavedAddress,
  StoreBankSettings,
  StorePrivateSettings,
  StorePublicSettings,
  UserProfile,
} from '../types/ecommerce';
import {
  computeProductPricing,
  deriveOrderStatus,
  formatLagosDateTime,
  formatOrderNumberFromCounter,
  getLagosDateKey,
  mapOrderStatusToDeliveryStatus,
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
} from '../utils/nigerianCurrency';
import {
  DEFAULT_BANK_SETTINGS,
  DEFAULT_EMAIL_PREFERENCES,
  DEFAULT_PRIVATE_SETTINGS,
  DEFAULT_PUBLIC_SETTINGS,
} from '../config/defaultStoreContent';
import {
  buildAdminNewOrderEmail,
  buildAdminOrderReceivedEmail,
  buildAdminPaymentRejectedEmail,
  buildAdminPaymentSubmittedEmail,
  buildAdminPaymentVerifiedEmail,
  buildCustomerOrderPlacedEmail,
  buildCustomerOrderReceivedEmail,
  buildCustomerPaymentRejectedEmail,
  buildCustomerPaymentSubmittedEmail,
  buildCustomerPaymentVerifiedEmail,
  buildCustomerRefundConfirmedEmail,
  buildCustomerStatusStageEmail,
  buildOrderCancelledEmail,
  EmailTemplateContext,
} from '../utils/emailTemplates';

const USE_CLOUD_FUNCTIONS = import.meta.env.VITE_USE_CLOUD_FUNCTIONS === 'true';

export function generateId(prefix = 'id'): string {
  const rand = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${Date.now()}_${rand}`;
}

// ==========================================
// STORE SETTINGS
// ==========================================

export async function fetchPublicStoreSettings(): Promise<StorePublicSettings> {
  const path = 'storeSettings/public';
  try {
    const snap = await getDoc(doc(db, 'storeSettings', 'public'));
    if (snap.exists()) {
      return snap.data() as StorePublicSettings;
    }
    return { ...DEFAULT_PUBLIC_SETTINGS, updatedAt: null };
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function fetchBankSettings(): Promise<StoreBankSettings> {
  const path = 'storeSettings/bankDetails';
  try {
    const snap = await getDoc(doc(db, 'storeSettings', 'bankDetails'));
    if (snap.exists()) {
      return snap.data() as StoreBankSettings;
    }
    return { ...DEFAULT_BANK_SETTINGS, updatedAt: null };
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function fetchPrivateSettings(): Promise<StorePrivateSettings> {
  const path = 'storeSettings/private';
  try {
    const snap = await getDoc(doc(db, 'storeSettings', 'private'));
    if (snap.exists()) {
      return snap.data() as StorePrivateSettings;
    }
    return { ...DEFAULT_PRIVATE_SETTINGS, updatedAt: null };
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function savePublicStoreSettings(
  data: Omit<StorePublicSettings, 'settingId' | 'updatedAt'>
): Promise<void> {
  const path = 'storeSettings/public';
  try {
    await setDoc(doc(db, 'storeSettings', 'public'), {
      ...data,
      settingId: 'public',
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function saveBankStoreSettings(
  data: Omit<StoreBankSettings, 'settingId' | 'updatedAt'>
): Promise<void> {
  const path = 'storeSettings/bankDetails';
  try {
    await setDoc(doc(db, 'storeSettings', 'bankDetails'), {
      ...data,
      settingId: 'bankDetails',
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function savePrivateStoreSettings(
  data: Omit<StorePrivateSettings, 'settingId' | 'updatedAt'>
): Promise<void> {
  const path = 'storeSettings/private';
  try {
    await setDoc(doc(db, 'storeSettings', 'private'), {
      ...data,
      settingId: 'private',
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function fetchEmailPreferences(): Promise<EmailPreferencesSettings> {
  const path = 'storeSettings/emailPreferences';
  try {
    const snap = await getDoc(doc(db, 'storeSettings', 'emailPreferences'));
    if (snap.exists()) {
      const data = snap.data() as Partial<EmailPreferencesSettings>;
      return {
        ...DEFAULT_EMAIL_PREFERENCES,
        ...data,
        events: {
          ...DEFAULT_EMAIL_PREFERENCES.events,
          ...(data.events || {}),
        },
        updatedAt: data.updatedAt || null,
      };
    }
    return { ...DEFAULT_EMAIL_PREFERENCES, updatedAt: null };
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function saveEmailPreferences(
  data: Omit<EmailPreferencesSettings, 'settingId' | 'updatedAt'>
): Promise<void> {
  const path = 'storeSettings/emailPreferences';
  try {
    await setDoc(doc(db, 'storeSettings', 'emailPreferences'), {
      ...data,
      settingId: 'emailPreferences',
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

// ==========================================
// CATEGORIES
// ==========================================

export async function fetchActiveCategories(): Promise<Category[]> {
  const path = 'categories';
  try {
    const q = query(collection(db, 'categories'), where('isActive', '==', true));
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => d.data() as Category)
      .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function fetchAllCategoriesAdmin(): Promise<Category[]> {
  const path = 'categories';
  try {
    const snap = await getDocs(collection(db, 'categories'));
    return snap.docs
      .map((d) => d.data() as Category)
      .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function upsertCategory(
  category: Omit<Category, 'createdAt' | 'updatedAt'>,
  isNew: boolean
): Promise<void> {
  const path = `categories/${category.categoryId}`;
  try {
    const ref = doc(db, 'categories', category.categoryId);
    if (isNew) {
      await setDoc(ref, {
        ...category,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const existing = await getDoc(ref);
      await updateDoc(ref, {
        name: category.name,
        slug: category.slug,
        description: category.description || '',
        image: category.image || '',
        displayOrder: category.displayOrder,
        isActive: category.isActive,
        createdAt: existing.data()?.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteCategorySafely(categoryId: string): Promise<void> {
  const path = `categories/${categoryId}`;
  try {
    const prodSnap = await getDocs(
      query(collection(db, 'products'), where('categoryId', '==', categoryId), limit(1))
    );
    if (!prodSnap.empty) {
      throw new Error('Cannot delete a category that still has assigned products. Reassign products first.');
    }
    await deleteDoc(doc(db, 'categories', categoryId));
  } catch (err) {
    if (err instanceof Error && err.message.includes('Reassign products')) throw err;
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

// ==========================================
// PRODUCTS & DISCOUNTS
// ==========================================

export async function fetchPublishedProducts(): Promise<Product[]> {
  const path = 'products';
  try {
    const q = query(collection(db, 'products'), where('isPublished', '==', true));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as Product);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function fetchAllProductsAdmin(): Promise<Product[]> {
  const path = 'products';
  try {
    const snap = await getDocs(collection(db, 'products'));
    return snap.docs.map((d) => d.data() as Product);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function fetchProductBySlug(slug: string): Promise<Product | null> {
  const path = 'products';
  try {
    const q = query(
      collection(db, 'products'),
      where('isPublished', '==', true),
      where('slug', '==', slug),
      limit(1)
    );
    const snap = await getDocs(q);
    return snap.empty ? null : (snap.docs[0].data() as Product);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function fetchProductByIdAdmin(productId: string): Promise<Product | null> {
  const path = `products/${productId}`;
  try {
    const snap = await getDoc(doc(db, 'products', productId));
    return snap.exists() ? (snap.data() as Product) : null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function upsertProduct(
  product: Omit<Product, 'createdAt' | 'updatedAt'>,
  isNew: boolean
): Promise<void> {
  const path = `products/${product.productId}`;
  try {
    const ref = doc(db, 'products', product.productId);
    if (isNew) {
      await setDoc(ref, {
        ...product,
        salesCount: product.salesCount ?? 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const existing = await getDoc(ref);
      await setDoc(ref, {
        ...product,
        salesCount: existing.data()?.salesCount ?? product.salesCount ?? 0,
        createdAt: existing.data()?.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteProduct(productId: string): Promise<void> {
  const path = `products/${productId}`;
  try {
    await deleteDoc(doc(db, 'products', productId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function fetchActiveDiscounts(): Promise<Discount[]> {
  const path = 'discounts';
  try {
    const q = query(collection(db, 'discounts'), where('isActive', '==', true));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as Discount);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function fetchAllDiscountsAdmin(): Promise<Discount[]> {
  const path = 'discounts';
  try {
    const snap = await getDocs(collection(db, 'discounts'));
    return snap.docs.map((d) => d.data() as Discount);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function upsertDiscount(
  discount: Omit<Discount, 'createdAt' | 'updatedAt'>,
  isNew: boolean
): Promise<void> {
  const path = `discounts/${discount.discountId}`;
  try {
    const ref = doc(db, 'discounts', discount.discountId);
    if (isNew) {
      await setDoc(ref, {
        ...discount,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const existing = await getDoc(ref);
      await setDoc(ref, {
        ...discount,
        createdAt: existing.data()?.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteDiscount(discountId: string): Promise<void> {
  const path = `discounts/${discountId}`;
  try {
    await deleteDoc(doc(db, 'discounts', discountId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

// ==========================================
// DELIVERY ZONES
// ==========================================

export async function fetchActiveDeliveryZones(): Promise<DeliveryZone[]> {
  const path = 'deliveryZones';
  try {
    const q = query(collection(db, 'deliveryZones'), where('isActive', '==', true));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as DeliveryZone);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function fetchAllDeliveryZonesAdmin(): Promise<DeliveryZone[]> {
  const path = 'deliveryZones';
  try {
    const snap = await getDocs(collection(db, 'deliveryZones'));
    return snap.docs.map((d) => d.data() as DeliveryZone);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function upsertDeliveryZone(
  zone: Omit<DeliveryZone, 'createdAt' | 'updatedAt'>,
  isNew: boolean
): Promise<void> {
  const path = `deliveryZones/${zone.zoneId}`;
  try {
    const ref = doc(db, 'deliveryZones', zone.zoneId);
    if (isNew) {
      await setDoc(ref, {
        ...zone,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const existing = await getDoc(ref);
      await setDoc(ref, {
        ...zone,
        createdAt: existing.data()?.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteDeliveryZone(zoneId: string): Promise<void> {
  const path = `deliveryZones/${zoneId}`;
  try {
    await deleteDoc(doc(db, 'deliveryZones', zoneId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

import { matchDeliveryZone } from '../utils/nigeriaLocations';
export { matchDeliveryZone };

// ==========================================
// CARTS & ADDRESSES
// ==========================================

export async function fetchCustomerCart(uid: string): Promise<CartItem[]> {
  const path = `carts/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'carts', uid));
    if (!snap.exists()) return [];
    return (snap.data().items || []) as CartItem[];
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function saveCustomerCart(uid: string, items: CartItem[]): Promise<void> {
  const path = `carts/${uid}`;
  try {
    const ref = doc(db, 'carts', uid);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, {
        items,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        cartId: uid,
        customerId: uid,
        items,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function fetchCustomerAddresses(uid: string): Promise<SavedAddress[]> {
  const path = 'addresses';
  try {
    const q = query(collection(db, 'addresses'), where('customerId', '==', uid));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as SavedAddress);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function upsertAddress(
  address: Omit<SavedAddress, 'createdAt' | 'updatedAt'>,
  isNew: boolean
): Promise<void> {
  const path = `addresses/${address.addressId}`;
  try {
    const ref = doc(db, 'addresses', address.addressId);
    if (isNew) {
      await setDoc(ref, {
        ...address,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        fullName: address.fullName,
        phone: address.phone,
        state: address.state,
        lga: address.lga,
        city: address.city,
        streetAddress: address.streetAddress,
        additionalInstructions: address.additionalInstructions || '',
        isDefault: address.isDefault,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteAddress(addressId: string): Promise<void> {
  const path = `addresses/${addressId}`;
  try {
    await deleteDoc(doc(db, 'addresses', addressId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

// ==========================================
// EMAIL OUTBOX & ORDER HISTORY HELPERS
// ==========================================

function isValidEmailAddress(email?: string | null): boolean {
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function buildEmailContextFromOrder(
  order: Order,
  pub: StorePublicSettings,
  bank: StoreBankSettings,
  extra: Partial<EmailTemplateContext> = {}
): EmailTemplateContext {
  const appUrl =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://koramarket.ng';
  const addr = order.deliveryAddress;
  const deliveryAddressText = [addr.streetAddress, addr.city, addr.lga, addr.state]
    .filter(Boolean)
    .join(', ');
  const resolvedOrderStatus = deriveOrderStatus(order);

  return {
    storeName: pub.storeName || 'KoraMarket',
    logoUrl: pub.logoUrl || '',
    contactEmail: pub.contactEmail || '',
    phoneNumber: pub.phoneNumber || '',
    businessAddress: pub.businessAddress || '',
    primaryColor: '#065F46',
    appUrl,
    orderNumber: order.orderNumber,
    orderId: order.orderId,
    customerName: order.customerSnapshot.fullName,
    customerEmail: order.customerSnapshot.email,
    customerPhone: order.customerSnapshot.phone,
    items: order.items.map((it) => ({
      productName: it.productName,
      quantity: it.quantity,
      finalUnitPriceKobo: it.finalUnitPriceKobo,
      lineTotalKobo: it.lineTotalKobo,
    })),
    subtotalKobo: order.subtotalKobo,
    discountTotalKobo: order.discountTotalKobo,
    deliveryFeeKobo: order.deliveryFeeKobo,
    totalKobo: order.totalKobo,
    orderStatusLabel: ORDER_STATUS_LABELS[resolvedOrderStatus] || resolvedOrderStatus,
    paymentStatusLabel: PAYMENT_STATUS_LABELS[order.paymentStatus] || order.paymentStatus,
    deliveryAddressText,
    bankDetails: {
      bankName: bank.bankName,
      accountName: bank.accountName,
      accountNumber: bank.accountNumber,
      transferInstructions: bank.transferInstructions,
    },
    timestampWat: `${formatLagosDateTime(new Date())} WAT`,
    ...extra,
  };
}

async function tryTriggerExpressDispatch(notificationIds: string[]): Promise<void> {
  if (USE_CLOUD_FUNCTIONS || notificationIds.length === 0) return;
  try {
    const user = auth.currentUser;
    if (!user) return;
    const token = await user.getIdToken();
    await fetch('/api/email/dispatch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ notificationIds }),
    });
  } catch {
    // Non-fatal: doc remains safely queued in Firestore for Cloud Function or manual retry
  }
}

async function enqueueEmailNotificationDoc(params: {
  eventId: string;
  orderId: string;
  orderNumber: string;
  recipient: string;
  recipientType: 'customer' | 'admin';
  notificationType: EmailNotificationType;
  subject: string;
  htmlBody: string;
}): Promise<string | null> {
  if (!isValidEmailAddress(params.recipient) && params.recipient !== 'admin-configured') {
    return null;
  }

  const safeId = `em_${params.eventId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 118)}`;
  try {
    await setDoc(doc(db, 'emailNotifications', safeId), {
      notificationId: safeId,
      eventId: params.eventId,
      orderId: params.orderId,
      orderNumber: params.orderNumber,
      recipient: params.recipient.trim(),
      recipientType: params.recipientType,
      notificationType: params.notificationType,
      subject: params.subject,
      htmlBody: params.htmlBody,
      status: 'queued',
      deliveryStatus: 'pending',
      attemptCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return safeId;
  } catch {
    // Duplicate idempotency key or permission edge must not fail checkout/transitions
    return null;
  }
}

export async function fetchOrderStatusHistory(
  orderId: string,
  customerId?: string
): Promise<OrderStatusHistoryEntry[]> {
  const path = 'orderStatusHistory';
  try {
    const q = customerId
      ? query(
          collection(db, 'orderStatusHistory'),
          where('customerId', '==', customerId),
          where('orderId', '==', orderId)
        )
      : query(collection(db, 'orderStatusHistory'), where('orderId', '==', orderId));
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => d.data() as OrderStatusHistoryEntry)
      .sort((a, b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function fetchEmailNotificationsAdmin(): Promise<EmailNotificationRecord[]> {
  const path = 'emailNotifications';
  try {
    const snap = await getDocs(
      query(collection(db, 'emailNotifications'), orderBy('createdAt', 'desc'), limit(150))
    );
    return snap.docs.map((d) => d.data() as EmailNotificationRecord);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

// ==========================================
// ORDERS & PAYMENTS (WITH ATOMIC ORDER IDS & EMAIL OUTBOX)
// ==========================================

export async function placeBankTransferOrder(params: {
  customerId: string;
  items: CartItem[];
  customerSnapshot: OrderCustomerSnapshot;
  deliveryAddress: OrderAddressSnapshot;
  deliveryInstructions?: string;
  idempotencyKey: string;
}): Promise<{ orderId: string; orderNumber: string }> {
  if (USE_CLOUD_FUNCTIONS) {
    const fn = httpsCallable<typeof params, { orderId: string; orderNumber: string }>(
      functions,
      'createOrder'
    );
    const res = await fn(params);
    return res.data;
  }

  // Revalidate authoritative product prices, discounts, and delivery zones directly from Firestore
  const [discounts, zones, pubSettings, bankSettings] = await Promise.all([
    fetchActiveDiscounts(),
    fetchActiveDeliveryZones(),
    fetchPublicStoreSettings(),
    fetchBankSettings(),
  ]);

  const matchedZone = matchDeliveryZone(
    zones,
    params.deliveryAddress.state,
    params.deliveryAddress.city
  );
  if (!matchedZone) {
    throw new Error(
      `Delivery is not currently available for ${params.deliveryAddress.state}. Please contact support or select a supported state.`
    );
  }

  const orderId = generateId('ord');
  const historyId = generateId('hist');
  const dateKey = getLagosDateKey();
  const orderPath = `orders/${orderId}`;

  let orderNumber = '';
  let createdOrder: Order | null = null;
  const authEmail = auth.currentUser?.email || params.customerSnapshot.email;

  try {
    await runTransaction(db, async (tx) => {
      const counterRef = doc(db, 'orderCounters', dateKey);
      const counterSnap = await tx.get(counterRef);

      const prodSnaps = await Promise.all(
        params.items.map((item) => tx.get(doc(db, 'products', item.productId)))
      );

      const currentSeq = counterSnap.exists() ? Number(counterSnap.data()?.lastSequence || 0) : 0;
      const nextSeq = currentSeq + 1;
      orderNumber = formatOrderNumberFromCounter(dateKey, nextSeq);

      const orderItems = [];
      let subtotalKobo = 0;
      let discountTotalKobo = 0;
      const nowMs = Date.now();

      for (let i = 0; i < params.items.length; i++) {
        const cartItem = params.items[i];
        const prodSnap = prodSnaps[i];
        if (!prodSnap.exists() || !prodSnap.data()?.isPublished) {
          throw new Error('One or more items in your cart are no longer available.');
        }
        const prod = prodSnap.data() as Product;
        if (prod.stockQuantity < cartItem.quantity) {
          throw new Error(`Insufficient stock for ${prod.name}. Only ${prod.stockQuantity} left.`);
        }

        const pricing = computeProductPricing(prod, discounts, nowMs);
        const lineTotalKobo = pricing.finalPriceKobo * cartItem.quantity;

        subtotalKobo += prod.priceKobo * cartItem.quantity;
        discountTotalKobo += pricing.discountAmountKobo * cartItem.quantity;

        orderItems.push({
          productId: prod.productId,
          productName: prod.name,
          slug: prod.slug,
          sku: prod.sku,
          image: prod.images[0] || '',
          selectedVariants: cartItem.selectedVariants || {},
          quantity: cartItem.quantity,
          unitPriceKobo: prod.priceKobo,
          discountPerUnitKobo: pricing.discountAmountKobo,
          finalUnitPriceKobo: pricing.finalPriceKobo,
          lineTotalKobo,
        });
      }

      const netSubtotal = subtotalKobo - discountTotalKobo;
      const freeThreshold = matchedZone.freeDeliveryThresholdKobo || 0;
      const deliveryFeeKobo =
        freeThreshold > 0 && netSubtotal >= freeThreshold ? 0 : matchedZone.deliveryFeeKobo;
      const totalKobo = netSubtotal + deliveryFeeKobo;

      const initialHistoryEntry: OrderStatusHistoryEntry = {
        historyId,
        orderId,
        statusField: 'orderStatus',
        previousStatus: '',
        newStatus: 'pending',
        changedBy: params.customerId,
        changedByEmail: authEmail,
        changedByRole: 'customer',
        timestamp: Timestamp.now(),
        notes: 'Order placed via Nigerian Bank Transfer checkout; awaiting administrator acknowledgement.',
      };

      if (counterSnap.exists()) {
        tx.update(counterRef, {
          dateKey,
          lastSequence: nextSeq,
          updatedAt: serverTimestamp(),
        });
      } else {
        tx.set(counterRef, {
          dateKey,
          lastSequence: 1,
          updatedAt: serverTimestamp(),
        });
      }

      const orderDocData = {
        orderId,
        orderNumber,
        customerId: params.customerId,
        customerSnapshot: params.customerSnapshot,
        items: orderItems,
        subtotalKobo,
        discountTotalKobo,
        deliveryFeeKobo,
        totalKobo,
        currency: 'NGN' as const,
        paymentMethod: 'bank_transfer' as const,
        orderStatus: 'pending' as OrderStatus,
        paymentStatus: 'awaiting_payment' as const,
        deliveryStatus: 'pending' as DeliveryStatus,
        deliveryAddress: params.deliveryAddress,
        deliveryZoneId: matchedZone.zoneId,
        deliveryInstructions: params.deliveryInstructions || '',
        statusHistory: [initialHistoryEntry],
        stockDeducted: false,
        idempotencyKey: params.idempotencyKey,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      tx.set(doc(db, 'orders', orderId), orderDocData);
      createdOrder = { ...orderDocData, createdAt: Timestamp.now(), updatedAt: Timestamp.now() };
    });

    // Post-order commit: immutable history, cart cleanup, in-app notifications, and email outbox
    const emailCtx = buildEmailContextFromOrder(createdOrder!, pubSettings, bankSettings);
    const custEmailDoc = buildCustomerOrderPlacedEmail(emailCtx);
    const adminEmailDoc = buildAdminNewOrderEmail(emailCtx);

    const [, , , custEmailId, adminEmailId] = await Promise.all([
      deleteDoc(doc(db, 'carts', params.customerId)).catch(() => {}),
      setDoc(doc(db, 'orderStatusHistory', historyId), {
        historyId,
        orderId,
        customerId: params.customerId,
        statusField: 'orderStatus',
        previousStatus: '',
        newStatus: 'pending',
        changedBy: params.customerId,
        changedByEmail: authEmail,
        changedByRole: 'customer',
        notes: 'Order placed via Nigerian Bank Transfer checkout.',
        timestamp: serverTimestamp(),
      }).catch(() => {}),
      createNotification({
        recipientId: params.customerId,
        type: 'order_placed',
        title: `Order ${orderNumber} Placed`,
        message: 'Complete your bank transfer and upload proof of payment to start verification.',
        relatedOrderId: orderId,
      }),
      enqueueEmailNotificationDoc({
        eventId: `${orderId}:order_placed:customer`,
        orderId,
        orderNumber,
        recipient: authEmail,
        recipientType: 'customer',
        notificationType: 'order_placed',
        subject: custEmailDoc.subject,
        htmlBody: custEmailDoc.html,
      }),
      enqueueEmailNotificationDoc({
        eventId: `${orderId}:order_placed:admin`,
        orderId,
        orderNumber,
        recipient: 'admin-configured',
        recipientType: 'admin',
        notificationType: 'order_placed',
        subject: adminEmailDoc.subject,
        htmlBody: adminEmailDoc.html,
      }),
    ]);

    await createNotification({
      recipientId: 'admin',
      type: 'new_order',
      title: `New Pending Order ${orderNumber}`,
      message: `${params.customerSnapshot.fullName} placed an order awaiting acknowledgement.`,
      relatedOrderId: orderId,
    });

    const dispatchIds = [custEmailId, adminEmailId].filter(Boolean) as string[];
    void tryTriggerExpressDispatch(dispatchIds);

    return { orderId, orderNumber };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, orderPath);
  }
}

export async function fetchCustomerOrders(customerId: string): Promise<Order[]> {
  const path = 'orders';
  try {
    const q = query(collection(db, 'orders'), where('customerId', '==', customerId));
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => d.data() as Order)
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function fetchOrderById(orderId: string): Promise<Order | null> {
  const path = `orders/${orderId}`;
  try {
    const snap = await getDoc(doc(db, 'orders', orderId));
    return snap.exists() ? (snap.data() as Order) : null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function fetchAllOrdersAdmin(): Promise<Order[]> {
  const path = 'orders';
  try {
    const snap = await getDocs(collection(db, 'orders'));
    return snap.docs
      .map((d) => d.data() as Order)
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function submitPaymentEvidence(params: {
  orderId: string;
  customerId: string;
  amountKobo: number;
  orderNumber: string;
  transferReference: string;
  transferDate: string;
  receiptImageUrl?: string;
}): Promise<string> {
  if (USE_CLOUD_FUNCTIONS) {
    const fn = httpsCallable<any, { paymentId: string }>(functions, 'submitPayment');
    const res = await fn(params);
    return res.data.paymentId;
  }

  const paymentId = generateId('pay');
  const historyId = generateId('hist');
  const paymentPath = `payments/${paymentId}`;
  const authEmail = auth.currentUser?.email || '';

  try {
    const orderSnap = await getDoc(doc(db, 'orders', params.orderId));
    const existingOrder = orderSnap.exists() ? (orderSnap.data() as Order) : null;
    const prevPayStatus = existingOrder?.paymentStatus || 'awaiting_payment';

    await setDoc(doc(db, 'payments', paymentId), {
      paymentId,
      orderId: params.orderId,
      customerId: params.customerId,
      amountKobo: params.amountKobo,
      paymentMethod: 'bank_transfer',
      transferReference: params.transferReference.trim(),
      transferDate: params.transferDate.trim(),
      receiptImageUrl: params.receiptImageUrl || '',
      status: 'payment_submitted',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await updateDoc(doc(db, 'orders', params.orderId), {
      paymentStatus: 'payment_submitted',
      updatedAt: serverTimestamp(),
    });

    const [pubSettings, bankSettings] = await Promise.all([
      fetchPublicStoreSettings(),
      fetchBankSettings(),
    ]);

    const emailIds: string[] = [];
    if (existingOrder) {
      const ctx = buildEmailContextFromOrder(
        { ...existingOrder, paymentStatus: 'payment_submitted' },
        pubSettings,
        bankSettings,
        {
          transferReference: params.transferReference.trim(),
          transferDate: params.transferDate.trim(),
        }
      );
      const custMail = buildCustomerPaymentSubmittedEmail(ctx);
      const adminMail = buildAdminPaymentSubmittedEmail(ctx);
      const [custEmailId, adminEmailId] = await Promise.all([
        enqueueEmailNotificationDoc({
          eventId: `${params.orderId}:payment_submitted:${paymentId}:customer`,
          orderId: params.orderId,
          orderNumber: params.orderNumber,
          recipient: authEmail || existingOrder.customerSnapshot.email,
          recipientType: 'customer',
          notificationType: 'payment_submitted',
          subject: custMail.subject,
          htmlBody: custMail.html,
        }),
        enqueueEmailNotificationDoc({
          eventId: `${params.orderId}:payment_submitted:${paymentId}:admin`,
          orderId: params.orderId,
          orderNumber: params.orderNumber,
          recipient: 'admin-configured',
          recipientType: 'admin',
          notificationType: 'payment_submitted',
          subject: adminMail.subject,
          htmlBody: adminMail.html,
        }),
      ]);
      if (custEmailId) emailIds.push(custEmailId);
      if (adminEmailId) emailIds.push(adminEmailId);
    }

    await Promise.all([
      setDoc(doc(db, 'orderStatusHistory', historyId), {
        historyId,
        orderId: params.orderId,
        customerId: params.customerId,
        statusField: 'paymentStatus',
        previousStatus: prevPayStatus,
        newStatus: 'payment_submitted',
        changedBy: params.customerId,
        changedByEmail: authEmail,
        changedByRole: 'customer',
        notes: `Bank transfer proof uploaded (Ref: ${params.transferReference.trim()})`,
        timestamp: serverTimestamp(),
      }).catch(() => {}),
      createNotification({
        recipientId: params.customerId,
        type: 'payment_submitted',
        title: `Payment Submitted: ${params.orderNumber}`,
        message: 'Your transfer receipt has been submitted and is awaiting administrator verification.',
        relatedOrderId: params.orderId,
      }),
      createNotification({
        recipientId: 'admin',
        type: 'payment_submitted',
        title: `Verify Payment: ${params.orderNumber}`,
        message: `Ref: ${params.transferReference.trim()} requires bank statement verification.`,
        relatedOrderId: params.orderId,
      }),
    ]);

    void tryTriggerExpressDispatch(emailIds);
    return paymentId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, paymentPath);
  }
}

export async function fetchOrderPayments(orderId: string, customerId?: string): Promise<PaymentSubmission[]> {
  const path = 'payments';
  try {
    const q = customerId
      ? query(
          collection(db, 'payments'),
          where('customerId', '==', customerId),
          where('orderId', '==', orderId)
        )
      : query(collection(db, 'payments'), where('orderId', '==', orderId));
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => d.data() as PaymentSubmission)
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function fetchAllPaymentsAdmin(): Promise<PaymentSubmission[]> {
  const path = 'payments';
  try {
    const snap = await getDocs(collection(db, 'payments'));
    return snap.docs
      .map((d) => d.data() as PaymentSubmission)
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function adminMarkOrderReceived(params: {
  orderId: string;
  adminUid: string;
  adminEmail: string;
  notes?: string;
}): Promise<{ transitioned: boolean }> {
  if (USE_CLOUD_FUNCTIONS) {
    const fn = httpsCallable<
      { orderId: string; notes?: string },
      { success: boolean; transitioned: boolean }
    >(functions, 'markOrderReceived');
    const res = await fn({ orderId: params.orderId, notes: params.notes });
    return { transitioned: res.data.transitioned };
  }

  const path = `orders/${params.orderId}`;
  try {
    let updatedOrder: Order | null = null;
    let transitioned = false;
    const historyId = generateId('hist');

    await runTransaction(db, async (tx) => {
      const orderRef = doc(db, 'orders', params.orderId);
      const oSnap = await tx.get(orderRef);
      if (!oSnap.exists()) throw new Error('Order not found.');
      const order = oSnap.data() as Order;
      const currentStatus = deriveOrderStatus(order) as OrderStatus;
      if (currentStatus !== 'pending') {
        updatedOrder = order;
        return;
      }

      transitioned = true;
      const entry: OrderStatusHistoryEntry = {
        historyId,
        orderId: order.orderId,
        statusField: 'orderStatus',
        previousStatus: currentStatus,
        newStatus: 'received',
        changedBy: params.adminUid,
        changedByEmail: params.adminEmail,
        changedByRole: 'admin',
        timestamp: Timestamp.now(),
        notes: params.notes || 'Order acknowledged and marked Received by store administrator.',
      };
      const nextHistory = [...(Array.isArray(order.statusHistory) ? order.statusHistory : []), entry];
      const nextDeliveryStatus: DeliveryStatus =
        order.deliveryStatus === 'pending' ? 'confirmed' : order.deliveryStatus;

      tx.update(orderRef, {
        orderStatus: 'received',
        deliveryStatus: nextDeliveryStatus,
        receivedAt: serverTimestamp(),
        receivedBy: params.adminUid,
        receivedByEmail: params.adminEmail,
        statusHistory: nextHistory,
        updatedAt: serverTimestamp(),
      });

      updatedOrder = {
        ...order,
        orderStatus: 'received',
        deliveryStatus: nextDeliveryStatus,
        statusHistory: nextHistory,
      };
    });

    if (transitioned && updatedOrder) {
      const ord = updatedOrder as Order;
      const [pubSettings, bankSettings, emailPrefs] = await Promise.all([
        fetchPublicStoreSettings(),
        fetchBankSettings(),
        fetchEmailPreferences(),
      ]);

      await Promise.all([
        setDoc(doc(db, 'orderStatusHistory', historyId), {
          historyId,
          orderId: ord.orderId,
          customerId: ord.customerId,
          statusField: 'orderStatus',
          previousStatus: 'pending',
          newStatus: 'received',
          changedBy: params.adminUid,
          changedByEmail: params.adminEmail,
          changedByRole: 'admin',
          notes: params.notes || 'Order acknowledged and marked Received by store administrator.',
          timestamp: serverTimestamp(),
        }),
        createNotification({
          recipientId: ord.customerId,
          type: 'order_received',
          title: `Order ${ord.orderNumber} Received`,
          message: 'Our team has received and acknowledged your order.',
          relatedOrderId: ord.orderId,
        }),
        createNotification({
          recipientId: 'admin',
          type: 'order_received',
          title: `Order ${ord.orderNumber} Acknowledged`,
          message: `Marked Received by ${params.adminEmail || params.adminUid}.`,
          relatedOrderId: ord.orderId,
        }),
        createAuditLog({
          actorUid: params.adminUid,
          actorEmail: params.adminEmail,
          action: 'MARK_ORDER_RECEIVED',
          targetCollection: 'orders',
          targetId: ord.orderId,
          details: `Order ${ord.orderNumber} acknowledged and transitioned from Pending to Received.`,
        }),
      ]);

      if (emailPrefs.emailsEnabled) {
        const ctx = buildEmailContextFromOrder(ord, pubSettings, bankSettings);
        const queuedIds: string[] = [];
        if (emailPrefs.events.orderReceivedCustomer) {
          const custMail = buildCustomerOrderReceivedEmail(ctx);
          const id = await enqueueEmailNotificationDoc({
            eventId: `${ord.orderId}:order_received:customer`,
            orderId: ord.orderId,
            orderNumber: ord.orderNumber,
            recipient: ord.customerSnapshot.email,
            recipientType: 'customer',
            notificationType: 'order_received',
            subject: custMail.subject,
            htmlBody: custMail.html,
          });
          if (id) queuedIds.push(id);
        }
        if (emailPrefs.events.orderReceivedAdmin) {
          const adminMail = buildAdminOrderReceivedEmail(ctx);
          const id = await enqueueEmailNotificationDoc({
            eventId: `${ord.orderId}:order_received:admin`,
            orderId: ord.orderId,
            orderNumber: ord.orderNumber,
            recipient: emailPrefs.adminNotificationEmail || 'reddox528@gmail.com',
            recipientType: 'admin',
            notificationType: 'order_received',
            subject: adminMail.subject,
            htmlBody: adminMail.html,
          });
          if (id) queuedIds.push(id);
        }
        void tryTriggerExpressDispatch(queuedIds);
      }
    }

    return { transitioned };
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function adminVerifyPayment(params: {
  paymentId: string;
  orderId: string;
  adminUid: string;
  adminEmail: string;
  notes?: string;
}): Promise<void> {
  if (USE_CLOUD_FUNCTIONS) {
    const fn = httpsCallable(functions, 'verifyPayment');
    await fn(params);
    return;
  }

  const path = `payments/${params.paymentId}`;
  const historyId = generateId('hist');
  try {
    let updatedOrder: Order | null = null;
    let prevPaymentStatus = '';

    await runTransaction(db, async (tx) => {
      const paymentRef = doc(db, 'payments', params.paymentId);
      const orderRef = doc(db, 'orders', params.orderId);
      const [pSnap, oSnap] = await Promise.all([tx.get(paymentRef), tx.get(orderRef)]);
      if (!pSnap.exists() || !oSnap.exists()) {
        throw new Error('Payment or order not found.');
      }
      const order = oSnap.data() as Order;
      prevPaymentStatus = order.paymentStatus;

      // Atomically read & deduct product stock if not yet deducted
      if (!order.stockDeducted) {
        const prodSnaps = await Promise.all(
          order.items.map((item) => tx.get(doc(db, 'products', item.productId)))
        );
        for (let i = 0; i < order.items.length; i++) {
          const item = order.items[i];
          const prodSnap = prodSnaps[i];
          if (prodSnap.exists()) {
            const prod = prodSnap.data() as Product;
            if (prod.stockQuantity < item.quantity) {
              throw new Error(`Insufficient stock for ${prod.name} during verification.`);
            }
            const newQty = prod.stockQuantity - item.quantity;
            tx.update(doc(db, 'products', item.productId), {
              stockQuantity: newQty,
              salesCount: (prod.salesCount || 0) + item.quantity,
              updatedAt: serverTimestamp(),
            });
            const logId = generateId('inv');
            tx.set(doc(db, 'inventoryLogs', logId), {
              logId,
              productId: prod.productId,
              changeType: 'order_deduction',
              quantityChanged: -item.quantity,
              previousQuantity: prod.stockQuantity,
              newQuantity: newQty,
              relatedOrderId: order.orderId,
              performedBy: params.adminUid,
              reason: `Stock deducted on verified payment for ${order.orderNumber}`,
              createdAt: serverTimestamp(),
            });
          }
        }
      }

      const historyEntry: OrderStatusHistoryEntry = {
        historyId,
        orderId: order.orderId,
        statusField: 'paymentStatus',
        previousStatus: order.paymentStatus,
        newStatus: 'paid',
        changedBy: params.adminUid,
        changedByEmail: params.adminEmail,
        changedByRole: 'admin',
        timestamp: Timestamp.now(),
        notes: params.notes || 'Bank transfer verified and confirmed Paid.',
      };
      const nextHistory = [
        ...(Array.isArray(order.statusHistory) ? order.statusHistory : []),
        historyEntry,
      ];

      tx.update(paymentRef, {
        status: 'paid',
        verificationNotes: params.notes || 'Bank transfer verified',
        verifiedBy: params.adminUid,
        verifiedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Keep orderStatus independent from paymentStatus
      tx.update(orderRef, {
        paymentStatus: 'paid',
        stockDeducted: true,
        statusHistory: nextHistory,
        updatedAt: serverTimestamp(),
      });

      updatedOrder = {
        ...order,
        paymentStatus: 'paid',
        stockDeducted: true,
        statusHistory: nextHistory,
      };
    });

    if (updatedOrder) {
      const ord = updatedOrder as Order;
      const [pubSettings, bankSettings, emailPrefs] = await Promise.all([
        fetchPublicStoreSettings(),
        fetchBankSettings(),
        fetchEmailPreferences(),
      ]);

      await Promise.all([
        setDoc(doc(db, 'orderStatusHistory', historyId), {
          historyId,
          orderId: ord.orderId,
          customerId: ord.customerId,
          statusField: 'paymentStatus',
          previousStatus: prevPaymentStatus,
          newStatus: 'paid',
          changedBy: params.adminUid,
          changedByEmail: params.adminEmail,
          changedByRole: 'admin',
          notes: params.notes || 'Bank transfer verified and confirmed Paid.',
          timestamp: serverTimestamp(),
        }),
        createNotification({
          recipientId: ord.customerId,
          type: 'payment_confirmed',
          title: `Payment Verified: ${ord.orderNumber}`,
          message: 'Your bank transfer has been confirmed.',
          relatedOrderId: ord.orderId,
        }),
        createAuditLog({
          actorUid: params.adminUid,
          actorEmail: params.adminEmail,
          action: 'VERIFY_PAYMENT',
          targetCollection: 'payments',
          targetId: params.paymentId,
          details: `Order ${ord.orderNumber} verified paid. Notes: ${params.notes || 'None'}`,
        }),
      ]);

      if (emailPrefs.emailsEnabled) {
        const ctx = buildEmailContextFromOrder(ord, pubSettings, bankSettings);
        const queuedIds: string[] = [];
        if (emailPrefs.events.paymentVerifiedCustomer) {
          const custMail = buildCustomerPaymentVerifiedEmail(ctx);
          const id = await enqueueEmailNotificationDoc({
            eventId: `${ord.orderId}:payment_verified:${params.paymentId}:customer`,
            orderId: ord.orderId,
            orderNumber: ord.orderNumber,
            recipient: ord.customerSnapshot.email,
            recipientType: 'customer',
            notificationType: 'payment_verified',
            subject: custMail.subject,
            htmlBody: custMail.html,
          });
          if (id) queuedIds.push(id);
        }
        if (emailPrefs.events.paymentVerifiedAdmin) {
          const adminMail = buildAdminPaymentVerifiedEmail(ctx);
          const id = await enqueueEmailNotificationDoc({
            eventId: `${ord.orderId}:payment_verified:${params.paymentId}:admin`,
            orderId: ord.orderId,
            orderNumber: ord.orderNumber,
            recipient: emailPrefs.adminNotificationEmail || 'reddox528@gmail.com',
            recipientType: 'admin',
            notificationType: 'payment_verified',
            subject: adminMail.subject,
            htmlBody: adminMail.html,
          });
          if (id) queuedIds.push(id);
        }
        void tryTriggerExpressDispatch(queuedIds);
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function adminRejectPayment(params: {
  paymentId: string;
  orderId: string;
  adminUid: string;
  adminEmail: string;
  reason: string;
}): Promise<void> {
  if (USE_CLOUD_FUNCTIONS) {
    const fn = httpsCallable(functions, 'rejectPayment');
    await fn(params);
    return;
  }

  const path = `payments/${params.paymentId}`;
  const historyId = generateId('hist');
  try {
    let updatedOrder: Order | null = null;
    let prevPayStatus = '';

    await runTransaction(db, async (tx) => {
      const paymentRef = doc(db, 'payments', params.paymentId);
      const orderRef = doc(db, 'orders', params.orderId);
      const [pSnap, oSnap] = await Promise.all([tx.get(paymentRef), tx.get(orderRef)]);
      if (!pSnap.exists() || !oSnap.exists()) throw new Error('Record not found.');
      const order = oSnap.data() as Order;
      prevPayStatus = order.paymentStatus;

      const historyEntry: OrderStatusHistoryEntry = {
        historyId,
        orderId: order.orderId,
        statusField: 'paymentStatus',
        previousStatus: order.paymentStatus,
        newStatus: 'payment_rejected',
        changedBy: params.adminUid,
        changedByEmail: params.adminEmail,
        changedByRole: 'admin',
        timestamp: Timestamp.now(),
        notes: params.reason.trim(),
      };
      const nextHistory = [
        ...(Array.isArray(order.statusHistory) ? order.statusHistory : []),
        historyEntry,
      ];

      tx.update(paymentRef, {
        status: 'payment_rejected',
        verificationNotes: params.reason.trim(),
        verifiedBy: params.adminUid,
        verifiedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      tx.update(orderRef, {
        paymentStatus: 'payment_rejected',
        statusHistory: nextHistory,
        updatedAt: serverTimestamp(),
      });

      updatedOrder = { ...order, paymentStatus: 'payment_rejected', statusHistory: nextHistory };
    });

    if (updatedOrder) {
      const ord = updatedOrder as Order;
      const [pubSettings, bankSettings, emailPrefs] = await Promise.all([
        fetchPublicStoreSettings(),
        fetchBankSettings(),
        fetchEmailPreferences(),
      ]);

      await Promise.all([
        setDoc(doc(db, 'orderStatusHistory', historyId), {
          historyId,
          orderId: ord.orderId,
          customerId: ord.customerId,
          statusField: 'paymentStatus',
          previousStatus: prevPayStatus,
          newStatus: 'payment_rejected',
          changedBy: params.adminUid,
          changedByEmail: params.adminEmail,
          changedByRole: 'admin',
          notes: params.reason.trim(),
          timestamp: serverTimestamp(),
        }),
        createNotification({
          recipientId: ord.customerId,
          type: 'payment_rejected',
          title: `Payment Rejected: ${ord.orderNumber}`,
          message: `Reason: ${params.reason.trim()}. Please upload a valid transfer receipt.`,
          relatedOrderId: ord.orderId,
        }),
        createAuditLog({
          actorUid: params.adminUid,
          actorEmail: params.adminEmail,
          action: 'REJECT_PAYMENT',
          targetCollection: 'payments',
          targetId: params.paymentId,
          details: `Order ${ord.orderNumber} rejected: ${params.reason.trim()}`,
        }),
      ]);

      if (emailPrefs.emailsEnabled) {
        const ctx = buildEmailContextFromOrder(ord, pubSettings, bankSettings, {
          rejectionReason: params.reason.trim(),
        });
        const queuedIds: string[] = [];
        if (emailPrefs.events.paymentRejectedCustomer) {
          const custMail = buildCustomerPaymentRejectedEmail(ctx);
          const id = await enqueueEmailNotificationDoc({
            eventId: `${ord.orderId}:payment_rejected:${params.paymentId}:customer`,
            orderId: ord.orderId,
            orderNumber: ord.orderNumber,
            recipient: ord.customerSnapshot.email,
            recipientType: 'customer',
            notificationType: 'payment_rejected',
            subject: custMail.subject,
            htmlBody: custMail.html,
          });
          if (id) queuedIds.push(id);
        }
        if (emailPrefs.events.paymentRejectedAdmin) {
          const adminMail = buildAdminPaymentRejectedEmail(ctx);
          const id = await enqueueEmailNotificationDoc({
            eventId: `${ord.orderId}:payment_rejected:${params.paymentId}:admin`,
            orderId: ord.orderId,
            orderNumber: ord.orderNumber,
            recipient: emailPrefs.adminNotificationEmail || 'reddox528@gmail.com',
            recipientType: 'admin',
            notificationType: 'payment_rejected',
            subject: adminMail.subject,
            htmlBody: adminMail.html,
          });
          if (id) queuedIds.push(id);
        }
        void tryTriggerExpressDispatch(queuedIds);
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function adminUpdateOrderStatus(params: {
  orderId: string;
  orderStatus?: OrderStatus;
  deliveryStatus?: DeliveryStatus;
  deliveryTrackingNotes?: string;
  deliveryPersonnel?: string;
  adminNotes?: string;
  cancellationReason?: string;
  adminUid: string;
  adminEmail: string;
}): Promise<void> {
  if (USE_CLOUD_FUNCTIONS) {
    const fn = httpsCallable(functions, 'updateOrderStatus');
    await fn(params);
    return;
  }

  const targetOrderStatus: OrderStatus =
    params.orderStatus ||
    ((params.deliveryStatus === 'confirmed'
      ? 'received'
      : params.deliveryStatus || 'pending') as OrderStatus);
  const targetDeliveryStatus: DeliveryStatus = (
    params.deliveryStatus || mapOrderStatusToDeliveryStatus(targetOrderStatus)
  ) as DeliveryStatus;

  const path = `orders/${params.orderId}`;
  const historyId = generateId('hist');

  try {
    let updatedOrder: Order | null = null;
    let prevOrderStatus = 'pending';

    await runTransaction(db, async (tx) => {
      const orderRef = doc(db, 'orders', params.orderId);
      const oSnap = await tx.get(orderRef);
      if (!oSnap.exists()) throw new Error('Order not found.');
      const order = oSnap.data() as Order;
      prevOrderStatus = deriveOrderStatus(order);

      const shouldRestore =
        targetOrderStatus === 'cancelled' &&
        prevOrderStatus !== 'cancelled' &&
        order.stockDeducted;

      if (shouldRestore) {
        const prodSnaps = await Promise.all(
          order.items.map((item) => tx.get(doc(db, 'products', item.productId)))
        );
        for (let i = 0; i < order.items.length; i++) {
          const item = order.items[i];
          const prodSnap = prodSnaps[i];
          if (prodSnap.exists()) {
            const prevQty = Number(prodSnap.data().stockQuantity || 0);
            const newQty = prevQty + item.quantity;
            tx.update(doc(db, 'products', item.productId), {
              stockQuantity: newQty,
              updatedAt: serverTimestamp(),
            });
            const logId = generateId('inv');
            tx.set(doc(db, 'inventoryLogs', logId), {
              logId,
              productId: item.productId,
              changeType: 'order_restoration',
              quantityChanged: item.quantity,
              previousQuantity: prevQty,
              newQuantity: newQty,
              relatedOrderId: order.orderId,
              performedBy: params.adminUid,
              reason: `Stock restored on order ${order.orderNumber} cancellation`,
              createdAt: serverTimestamp(),
            });
          }
        }
      }

      const statusNote =
        targetOrderStatus === 'cancelled'
          ? params.cancellationReason || 'Cancelled by administrator'
          : params.deliveryTrackingNotes ||
            `Order status updated to ${ORDER_STATUS_LABELS[targetOrderStatus] || targetOrderStatus}`;

      const historyEntry: OrderStatusHistoryEntry = {
        historyId,
        orderId: order.orderId,
        statusField: 'orderStatus',
        previousStatus: prevOrderStatus,
        newStatus: targetOrderStatus,
        changedBy: params.adminUid,
        changedByEmail: params.adminEmail,
        changedByRole: 'admin',
        timestamp: Timestamp.now(),
        notes: statusNote,
      };
      const nextHistory = [
        ...(Array.isArray(order.statusHistory) ? order.statusHistory : []),
        historyEntry,
      ];

      const updates: Record<string, any> = {
        orderStatus: targetOrderStatus,
        deliveryStatus: targetDeliveryStatus,
        statusHistory: nextHistory,
        updatedAt: serverTimestamp(),
      };
      if (params.deliveryTrackingNotes !== undefined) {
        updates.deliveryTrackingNotes = params.deliveryTrackingNotes;
      }
      if (params.deliveryPersonnel !== undefined) {
        updates.deliveryPersonnel = params.deliveryPersonnel;
      }
      if (params.adminNotes !== undefined) {
        updates.adminNotes = params.adminNotes;
      }
      if (shouldRestore) {
        updates.stockDeducted = false;
      }
      if (targetOrderStatus === 'received' && !order.receivedAt) {
        updates.receivedAt = serverTimestamp();
        updates.receivedBy = params.adminUid;
        updates.receivedByEmail = params.adminEmail;
      }
      if (targetOrderStatus === 'delivered' && !order.deliveredAt) {
        updates.deliveredAt = serverTimestamp();
      }
      if (targetOrderStatus === 'cancelled') {
        updates.cancelledAt = serverTimestamp();
        if (params.cancellationReason !== undefined) {
          updates.cancellationReason = params.cancellationReason;
        }
      }

      tx.update(orderRef, updates);
      updatedOrder = { ...order, ...updates };
    });

    if (updatedOrder) {
      const ord = updatedOrder as Order;
      const statusChanged = prevOrderStatus !== targetOrderStatus;
      const [pubSettings, bankSettings, emailPrefs] = await Promise.all([
        fetchPublicStoreSettings(),
        fetchBankSettings(),
        fetchEmailPreferences(),
      ]);

      await Promise.all([
        statusChanged
          ? setDoc(doc(db, 'orderStatusHistory', historyId), {
              historyId,
              orderId: ord.orderId,
              customerId: ord.customerId,
              statusField: 'orderStatus',
              previousStatus: prevOrderStatus,
              newStatus: targetOrderStatus,
              changedBy: params.adminUid,
              changedByEmail: params.adminEmail,
              changedByRole: 'admin',
              notes:
                targetOrderStatus === 'cancelled'
                  ? params.cancellationReason || 'Cancelled by administrator'
                  : params.deliveryTrackingNotes ||
                    `Status changed to ${ORDER_STATUS_LABELS[targetOrderStatus]}`,
              timestamp: serverTimestamp(),
            })
          : Promise.resolve(),
        createNotification({
          recipientId: ord.customerId,
          type: `order_${targetOrderStatus}`,
          title: `Order ${ord.orderNumber} Update`,
          message: `Your order status is now: ${ORDER_STATUS_LABELS[targetOrderStatus] || targetOrderStatus}.`,
          relatedOrderId: ord.orderId,
        }),
        createAuditLog({
          actorUid: params.adminUid,
          actorEmail: params.adminEmail,
          action: 'UPDATE_ORDER_STATUS',
          targetCollection: 'orders',
          targetId: ord.orderId,
          details: `Order ${ord.orderNumber} orderStatus -> ${targetOrderStatus}`,
        }),
      ]);

      if (statusChanged && emailPrefs.emailsEnabled) {
        const ctx = buildEmailContextFromOrder(ord, pubSettings, bankSettings, {
          trackingNotes: params.deliveryTrackingNotes,
          deliveryPersonnel: params.deliveryPersonnel,
          cancellationReason: params.cancellationReason,
        });
        const queuedIds: string[] = [];

        if (targetOrderStatus === 'received') {
          if (emailPrefs.events.orderReceivedCustomer) {
            const custMail = buildCustomerOrderReceivedEmail(ctx);
            const id = await enqueueEmailNotificationDoc({
              eventId: `${ord.orderId}:order_received:${historyId}:customer`,
              orderId: ord.orderId,
              orderNumber: ord.orderNumber,
              recipient: ord.customerSnapshot.email,
              recipientType: 'customer',
              notificationType: 'order_received',
              subject: custMail.subject,
              htmlBody: custMail.html,
            });
            if (id) queuedIds.push(id);
          }
          if (emailPrefs.events.orderReceivedAdmin) {
            const adminMail = buildAdminOrderReceivedEmail(ctx);
            const id = await enqueueEmailNotificationDoc({
              eventId: `${ord.orderId}:order_received:${historyId}:admin`,
              orderId: ord.orderId,
              orderNumber: ord.orderNumber,
              recipient: emailPrefs.adminNotificationEmail || 'reddox528@gmail.com',
              recipientType: 'admin',
              notificationType: 'order_received',
              subject: adminMail.subject,
              htmlBody: adminMail.html,
            });
            if (id) queuedIds.push(id);
          }
        } else if (targetOrderStatus === 'processing' && emailPrefs.events.orderProcessingCustomer) {
          const mail = buildCustomerStatusStageEmail(ctx, 'order_processing');
          const id = await enqueueEmailNotificationDoc({
            eventId: `${ord.orderId}:order_processing:${historyId}`,
            orderId: ord.orderId,
            orderNumber: ord.orderNumber,
            recipient: ord.customerSnapshot.email,
            recipientType: 'customer',
            notificationType: 'order_processing',
            subject: mail.subject,
            htmlBody: mail.html,
          });
          if (id) queuedIds.push(id);
        } else if (
          targetOrderStatus === 'ready_for_dispatch' &&
          emailPrefs.events.readyForDispatchCustomer
        ) {
          const mail = buildCustomerStatusStageEmail(ctx, 'ready_for_dispatch');
          const id = await enqueueEmailNotificationDoc({
            eventId: `${ord.orderId}:ready_for_dispatch:${historyId}`,
            orderId: ord.orderId,
            orderNumber: ord.orderNumber,
            recipient: ord.customerSnapshot.email,
            recipientType: 'customer',
            notificationType: 'ready_for_dispatch',
            subject: mail.subject,
            htmlBody: mail.html,
          });
          if (id) queuedIds.push(id);
        } else if (
          targetOrderStatus === 'out_for_delivery' &&
          emailPrefs.events.outForDeliveryCustomer
        ) {
          const mail = buildCustomerStatusStageEmail(ctx, 'out_for_delivery');
          const id = await enqueueEmailNotificationDoc({
            eventId: `${ord.orderId}:out_for_delivery:${historyId}`,
            orderId: ord.orderId,
            orderNumber: ord.orderNumber,
            recipient: ord.customerSnapshot.email,
            recipientType: 'customer',
            notificationType: 'out_for_delivery',
            subject: mail.subject,
            htmlBody: mail.html,
          });
          if (id) queuedIds.push(id);
        } else if (targetOrderStatus === 'delivered' && emailPrefs.events.deliveredCustomer) {
          const mail = buildCustomerStatusStageEmail(ctx, 'order_delivered');
          const id = await enqueueEmailNotificationDoc({
            eventId: `${ord.orderId}:order_delivered:${historyId}`,
            orderId: ord.orderId,
            orderNumber: ord.orderNumber,
            recipient: ord.customerSnapshot.email,
            recipientType: 'customer',
            notificationType: 'order_delivered',
            subject: mail.subject,
            htmlBody: mail.html,
          });
          if (id) queuedIds.push(id);
        } else if (targetOrderStatus === 'cancelled') {
          if (emailPrefs.events.orderCancelledCustomer) {
            const custMail = buildOrderCancelledEmail(ctx, 'customer');
            const id = await enqueueEmailNotificationDoc({
              eventId: `${ord.orderId}:order_cancelled:${historyId}:customer`,
              orderId: ord.orderId,
              orderNumber: ord.orderNumber,
              recipient: ord.customerSnapshot.email,
              recipientType: 'customer',
              notificationType: 'order_cancelled',
              subject: custMail.subject,
              htmlBody: custMail.html,
            });
            if (id) queuedIds.push(id);
          }
          if (emailPrefs.events.orderCancelledAdmin) {
            const adminMail = buildOrderCancelledEmail(ctx, 'admin');
            const id = await enqueueEmailNotificationDoc({
              eventId: `${ord.orderId}:order_cancelled:${historyId}:admin`,
              orderId: ord.orderId,
              orderNumber: ord.orderNumber,
              recipient: emailPrefs.adminNotificationEmail || 'reddox528@gmail.com',
              recipientType: 'admin',
              notificationType: 'order_cancelled',
              subject: adminMail.subject,
              htmlBody: adminMail.html,
            });
            if (id) queuedIds.push(id);
          }
        }

        void tryTriggerExpressDispatch(queuedIds);
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export const adminUpdateOrderDelivery = adminUpdateOrderStatus;

export async function adminRecordRefundConfirmed(params: {
  orderId: string;
  adminUid: string;
  adminEmail: string;
  refundNotes: string;
}): Promise<void> {
  if (USE_CLOUD_FUNCTIONS) {
    const fn = httpsCallable(functions, 'recordRefundConfirmed');
    await fn({ orderId: params.orderId, refundNotes: params.refundNotes });
    return;
  }

  const path = `orders/${params.orderId}`;
  const historyId = generateId('hist');
  try {
    let refundedOrder: Order | null = null;

    await runTransaction(db, async (tx) => {
      const orderRef = doc(db, 'orders', params.orderId);
      const oSnap = await tx.get(orderRef);
      if (!oSnap.exists()) throw new Error('Order not found.');
      const order = oSnap.data() as Order;
      if (order.paymentStatus !== 'paid') {
        throw new Error('Only orders with verified Paid status can be marked Refunded.');
      }

      const historyEntry: OrderStatusHistoryEntry = {
        historyId,
        orderId: order.orderId,
        statusField: 'paymentStatus',
        previousStatus: order.paymentStatus,
        newStatus: 'refunded',
        changedBy: params.adminUid,
        changedByEmail: params.adminEmail,
        changedByRole: 'admin',
        timestamp: Timestamp.now(),
        notes: params.refundNotes.trim(),
      };
      const nextHistory = [
        ...(Array.isArray(order.statusHistory) ? order.statusHistory : []),
        historyEntry,
      ];

      tx.update(orderRef, {
        paymentStatus: 'refunded',
        refundedAt: serverTimestamp(),
        refundNotes: params.refundNotes.trim(),
        statusHistory: nextHistory,
        updatedAt: serverTimestamp(),
      });

      refundedOrder = {
        ...order,
        paymentStatus: 'refunded',
        refundNotes: params.refundNotes.trim(),
        statusHistory: nextHistory,
      };
    });

    if (refundedOrder) {
      const ord = refundedOrder as Order;
      const [pubSettings, bankSettings, emailPrefs] = await Promise.all([
        fetchPublicStoreSettings(),
        fetchBankSettings(),
        fetchEmailPreferences(),
      ]);

      await Promise.all([
        setDoc(doc(db, 'orderStatusHistory', historyId), {
          historyId,
          orderId: ord.orderId,
          customerId: ord.customerId,
          statusField: 'paymentStatus',
          previousStatus: 'paid',
          newStatus: 'refunded',
          changedBy: params.adminUid,
          changedByEmail: params.adminEmail,
          changedByRole: 'admin',
          notes: params.refundNotes.trim(),
          timestamp: serverTimestamp(),
        }),
        createNotification({
          recipientId: ord.customerId,
          type: 'refund_confirmed',
          title: `Refund Confirmed: ${ord.orderNumber}`,
          message: `Refund completed: ${params.refundNotes.trim()}`,
          relatedOrderId: ord.orderId,
        }),
        createAuditLog({
          actorUid: params.adminUid,
          actorEmail: params.adminEmail,
          action: 'RECORD_REFUND_CONFIRMED',
          targetCollection: 'orders',
          targetId: ord.orderId,
          details: `Order ${ord.orderNumber} refunded. Ref: ${params.refundNotes.trim()}`,
        }),
      ]);

      if (emailPrefs.emailsEnabled && emailPrefs.events.refundConfirmedCustomer) {
        const ctx = buildEmailContextFromOrder(ord, pubSettings, bankSettings, {
          refundNotes: params.refundNotes.trim(),
        });
        const mail = buildCustomerRefundConfirmedEmail(ctx);
        const id = await enqueueEmailNotificationDoc({
          eventId: `${ord.orderId}:refund_confirmed:customer`,
          orderId: ord.orderId,
          orderNumber: ord.orderNumber,
          recipient: ord.customerSnapshot.email,
          recipientType: 'customer',
          notificationType: 'refund_confirmed',
          subject: mail.subject,
          htmlBody: mail.html,
        });
        if (id) void tryTriggerExpressDispatch([id]);
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function adminSendTestEmail(recipientEmail?: string): Promise<{
  status: string;
  deliveryStatus?: string;
  providerMessageId?: string;
  failureReason?: string;
}> {
  if (USE_CLOUD_FUNCTIONS) {
    const fn = httpsCallable<
      { recipientEmail?: string },
      { status: string; deliveryStatus?: string; providerMessageId?: string; failureReason?: string }
    >(functions, 'sendTestEmail');
    const res = await fn({ recipientEmail });
    return res.data;
  }

  const emailPrefs = await fetchEmailPreferences();
  const target = (recipientEmail || emailPrefs.adminNotificationEmail || auth.currentUser?.email || '').trim();
  if (!isValidEmailAddress(target)) {
    throw new Error('Please enter a valid recipient email address.');
  }

  const notificationId = generateId('em_test');
  const eventId = `test:${notificationId}`;
  const subject = `${emailPrefs.senderName || 'KoraMarket Nigeria'} – Email Configuration Test`;
  const htmlBody = `<div style="font-family:sans-serif;padding:24px;"><h2>Email Configuration Test</h2><p>This test confirms email configuration for <strong>${emailPrefs.senderName || 'KoraMarket Nigeria'}</strong>.</p><p>Sent at: ${formatLagosDateTime(new Date())} WAT</p></div>`;

  // Try Express server dispatch first if BREVO_API_KEY + Admin SDK are active on Express
  let expressOutcome: {
    status: string;
    deliveryStatus?: string;
    providerMessageId?: string;
    failureReason?: string;
  } | null = null;

  try {
    const token = await auth.currentUser?.getIdToken();
    if (token) {
      const resp = await fetch('/api/email/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          recipientEmail: target,
          senderName: emailPrefs.senderName,
          senderEmail: emailPrefs.senderEmail,
          replyToEmail: emailPrefs.replyToEmail,
          subject,
          htmlBody,
        }),
      });
      if (resp.status !== 501) {
        const json = await resp.json().catch(() => ({}));
        expressOutcome = {
          status: json.status || (resp.ok ? 'sent' : 'failed'),
          deliveryStatus: json.deliveryStatus || (resp.ok ? 'accepted_by_provider' : 'failed'),
          providerMessageId: json.providerMessageId || '',
          failureReason: json.failureReason || json.error || '',
        };
      }
    }
  } catch {
    // Fall through cleanly
  }

  if (expressOutcome) {
    // Also persist the honest log record if Express didn't already persist it
    await setDoc(doc(db, 'emailNotifications', notificationId), {
      notificationId,
      eventId,
      orderId: '',
      orderNumber: 'TEST-EMAIL',
      recipient: target,
      recipientType: 'admin',
      notificationType: 'test_email',
      subject,
      htmlBody,
      status: expressOutcome.status === 'sent' ? 'sent' : 'failed',
      deliveryStatus: expressOutcome.deliveryStatus || 'failed',
      ...(expressOutcome.providerMessageId
        ? { providerMessageId: expressOutcome.providerMessageId }
        : {}),
      attemptCount: 1,
      failureReason: expressOutcome.failureReason || '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastAttemptAt: serverTimestamp(),
      ...(expressOutcome.status === 'sent' ? { sentAt: serverTimestamp() } : {}),
    });
    return expressOutcome;
  }

  // No server email backend currently active in client-only preview: record honest queued/failed state
  const failureReason =
    'Brevo API key / Cloud Functions dispatcher is not active in preview (VITE_USE_CLOUD_FUNCTIONS=false and Express BREVO_API_KEY not configured). Deploy Cloud Functions + BREVO_API_KEY secret to deliver emails.';
  await setDoc(doc(db, 'emailNotifications', notificationId), {
    notificationId,
    eventId,
    orderId: '',
    orderNumber: 'TEST-EMAIL',
    recipient: target,
    recipientType: 'admin',
    notificationType: 'test_email',
    subject,
    htmlBody,
    status: 'failed',
    deliveryStatus: 'failed',
    attemptCount: 1,
    failureReason,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastAttemptAt: serverTimestamp(),
  });

  return {
    status: 'failed',
    deliveryStatus: 'failed',
    failureReason,
  };
}

export async function adminRetryEmailNotification(notificationId: string): Promise<{
  status: string;
  deliveryStatus?: string;
  failureReason?: string;
}> {
  if (USE_CLOUD_FUNCTIONS) {
    const fn = httpsCallable<
      { notificationId: string },
      { status: string; deliveryStatus?: string; failureReason?: string }
    >(functions, 'retryFailedEmail');
    const res = await fn({ notificationId });
    return res.data;
  }

  try {
    const token = await auth.currentUser?.getIdToken();
    if (token) {
      const resp = await fetch('/api/email/retry', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ notificationId }),
      });
      if (resp.status !== 501) {
        const json = await resp.json().catch(() => ({}));
        return {
          status: json.status || (resp.ok ? 'sent' : 'failed'),
          deliveryStatus: json.deliveryStatus,
          failureReason: json.failureReason || json.error || '',
        };
      }
    }
  } catch {
    // Requeue in Firestore so Cloud Function trigger picks it up once active
  }

  // Only set allowed 'queued' status per firestore.rules (triggers processEmailOutboxOnRequeue when Functions are deployed)
  const snap = await getDoc(doc(db, 'emailNotifications', notificationId));
  if (!snap.exists()) throw new Error('Email notification record not found.');
  const data = snap.data() as EmailNotificationRecord;
  await updateDoc(doc(db, 'emailNotifications', notificationId), {
    status: 'queued',
    deliveryStatus: 'pending',
    attemptCount: data.attemptCount,
    updatedAt: serverTimestamp(),
  });
  return {
    status: 'queued',
    deliveryStatus: 'pending',
    failureReason:
      'Notification re-queued. Deploy Firebase Cloud Functions with BREVO_API_KEY secret (or configure Express server BREVO_API_KEY) to dispatch queued emails.',
  };
}

// ==========================================
// INVENTORY LOGS & ADJUSTMENTS
// ==========================================

export async function adminAdjustProductStock(params: {
  productId: string;
  newQuantity: number;
  changeType: InventoryChangeType;
  reason: string;
  adminUid: string;
}): Promise<void> {
  const path = `products/${params.productId}`;
  try {
    await runTransaction(db, async (tx) => {
      const prodRef = doc(db, 'products', params.productId);
      const snap = await tx.get(prodRef);
      if (!snap.exists()) throw new Error('Product not found.');
      const prevQty = Number(snap.data().stockQuantity || 0);

      tx.update(prodRef, {
        stockQuantity: params.newQuantity,
        updatedAt: serverTimestamp(),
      });

      const logId = generateId('inv');
      tx.set(doc(db, 'inventoryLogs', logId), {
        logId,
        productId: params.productId,
        changeType: params.changeType,
        quantityChanged: params.newQuantity - prevQty,
        previousQuantity: prevQty,
        newQuantity: params.newQuantity,
        performedBy: params.adminUid,
        reason: params.reason.trim() || 'Manual stock adjustment',
        createdAt: serverTimestamp(),
      });
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function fetchInventoryLogsAdmin(): Promise<InventoryLog[]> {
  const path = 'inventoryLogs';
  try {
    const snap = await getDocs(collection(db, 'inventoryLogs'));
    return snap.docs
      .map((d) => d.data() as InventoryLog)
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

// ==========================================
// CUSTOMERS & REVIEWS & NOTIFICATIONS & AUDIT
// ==========================================

export async function fetchAllUsersAdmin(): Promise<UserProfile[]> {
  const path = 'users';
  try {
    const snap = await getDocs(collection(db, 'users'));
    return snap.docs.map((d) => d.data() as UserProfile);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function fetchApprovedProductReviews(productId: string): Promise<ProductReview[]> {
  const path = 'reviews';
  try {
    const q = query(
      collection(db, 'reviews'),
      where('productId', '==', productId),
      where('isApproved', '==', true)
    );
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => d.data() as ProductReview)
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function fetchAllApprovedReviews(): Promise<ProductReview[]> {
  const path = 'reviews';
  try {
    const q = query(collection(db, 'reviews'), where('isApproved', '==', true), limit(12));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as ProductReview);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function fetchAllReviewsAdmin(): Promise<ProductReview[]> {
  const path = 'reviews';
  try {
    const snap = await getDocs(collection(db, 'reviews'));
    return snap.docs
      .map((d) => d.data() as ProductReview)
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function submitProductReview(params: {
  productId: string;
  orderId: string;
  customerId: string;
  customerName: string;
  rating: number;
  comment: string;
}): Promise<void> {
  const reviewId = generateId('rev');
  const path = `reviews/${reviewId}`;
  try {
    await setDoc(doc(db, 'reviews', reviewId), {
      reviewId,
      productId: params.productId,
      orderId: params.orderId,
      customerId: params.customerId,
      customerName: params.customerName,
      rating: params.rating,
      comment: params.comment.trim(),
      isApproved: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function moderateReviewAdmin(reviewId: string, isApproved: boolean): Promise<void> {
  const path = `reviews/${reviewId}`;
  try {
    await updateDoc(doc(db, 'reviews', reviewId), {
      isApproved,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteReviewAdmin(reviewId: string): Promise<void> {
  const path = `reviews/${reviewId}`;
  try {
    await deleteDoc(doc(db, 'reviews', reviewId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function createNotification(params: {
  recipientId: string;
  type: string;
  title: string;
  message: string;
  relatedOrderId?: string;
}): Promise<void> {
  const notificationId = generateId('notif');
  const path = `notifications/${notificationId}`;
  try {
    await setDoc(doc(db, 'notifications', notificationId), {
      notificationId,
      recipientId: params.recipientId,
      type: params.type,
      title: params.title,
      message: params.message,
      relatedOrderId: params.relatedOrderId || '',
      isRead: false,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function fetchNotifications(recipientId: string): Promise<AppNotification[]> {
  const path = 'notifications';
  try {
    const q = query(collection(db, 'notifications'), where('recipientId', '==', recipientId));
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => d.data() as AppNotification)
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  const path = `notifications/${notificationId}`;
  try {
    await updateDoc(doc(db, 'notifications', notificationId), { isRead: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function subscribeNewsletter(email: string): Promise<void> {
  const subscriberId = generateId('sub');
  const path = `newsletterSubscribers/${subscriberId}`;
  try {
    await setDoc(doc(db, 'newsletterSubscribers', subscriberId), {
      subscriberId,
      email: email.trim().toLowerCase(),
      status: 'subscribed',
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function createAuditLog(params: {
  actorUid: string;
  actorEmail?: string;
  action: string;
  targetCollection: string;
  targetId: string;
  details?: string;
}): Promise<void> {
  const logId = generateId('audit');
  const path = `auditLogs/${logId}`;
  try {
    await setDoc(doc(db, 'auditLogs', logId), {
      logId,
      actorUid: params.actorUid,
      actorEmail: params.actorEmail || '',
      action: params.action,
      targetCollection: params.targetCollection,
      targetId: params.targetId,
      details: params.details || '',
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function fetchAuditLogsAdmin(): Promise<AuditLog[]> {
  const path = 'auditLogs';
  try {
    const snap = await getDocs(query(collection(db, 'auditLogs'), orderBy('createdAt', 'desc'), limit(50)));
    return snap.docs.map((d) => d.data() as AuditLog);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

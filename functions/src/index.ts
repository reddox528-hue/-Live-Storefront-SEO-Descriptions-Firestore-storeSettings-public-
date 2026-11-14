import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, Timestamp, Transaction } from 'firebase-admin/firestore';
import {
  buildAdminNewCustomerEmail,
  buildAdminNewOrderEmail,
  buildAdminOrderReceivedEmail,
  buildAdminPaymentRejectedEmail,
  buildAdminPaymentSubmittedEmail,
  buildAdminPaymentVerifiedEmail,
  buildAdminRefundConfirmedEmail,
  buildAdminStatusStageEmail,
  buildCustomerOrderPlacedEmail,
  buildCustomerOrderReceivedEmail,
  buildCustomerPaymentRejectedEmail,
  buildCustomerPaymentSubmittedEmail,
  buildCustomerPaymentVerifiedEmail,
  buildCustomerRefundConfirmedEmail,
  buildCustomerStatusStageEmail,
  buildOrderCancelledEmail,
  EmailTemplateContext,
} from './emailTemplates';
import {
  isValidEmailAddress,
  mapBrevoWebhookEventToDeliveryStatus,
  sendBrevoTransactionalEmail,
} from './brevoClient';

initializeApp();

const DATABASE_ID =
  process.env.FIRESTORE_DATABASE_ID || 'ai-studio-0aa6a804-3df3-4c29-9094-ee6edaaf8941';
const db = getFirestore(DATABASE_ID);
const auth = getAuth();

const brevoApiKeySecret = defineSecret('BREVO_API_KEY');
const BOOTSTRAP_OWNER_EMAIL = 'reddox528@gmail.com';

function resolveAdminNotificationEmail(emailPrefs: Record<string, any> = {}): string {
  return String(
    emailPrefs.adminNotificationEmail || process.env.ADMIN_NOTIFICATION_EMAIL || BOOTSTRAP_OWNER_EMAIL
  ).trim();
}

const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  received: 'Received',
  processing: 'Processing',
  ready_for_dispatch: 'Ready for Dispatch',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  awaiting_payment: 'Awaiting Payment',
  payment_submitted: 'Payment Submitted',
  under_verification: 'Under Verification',
  paid: 'Paid (Verified)',
  payment_rejected: 'Payment Rejected',
  refunded: 'Refunded',
};

function isValidEmail(email: string | undefined | null): boolean {
  return isValidEmailAddress(email);
}

function getLagosDateKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lagos',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find((p) => p.type === 'year')?.value || '2026';
  const month = parts.find((p) => p.type === 'month')?.value || '01';
  const day = parts.find((p) => p.type === 'day')?.value || '01';
  return `${year}${month}${day}`;
}

function formatLagosWat(date = new Date()): string {
  return (
    new Intl.DateTimeFormat('en-NG', {
      timeZone: 'Africa/Lagos',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date) + ' WAT'
  );
}

async function generateNextOrderNumberInTx(tx: Transaction): Promise<string> {
  const dateKey = getLagosDateKey();
  const counterRef = db.collection('orderCounters').doc(dateKey);
  const snap = await tx.get(counterRef);
  const currentSeq = snap.exists ? Number(snap.data()?.lastSequence || 0) : 0;
  const nextSeq = currentSeq + 1;

  tx.set(
    counterRef,
    {
      dateKey,
      lastSequence: nextSeq,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return `ORD-${dateKey}-${String(nextSeq).padStart(4, '0')}`;
}

async function assertVerifiedAuth(request: { auth?: { uid: string; token: Record<string, any> } }) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication required.');
  }
  if (!request.auth.token.email_verified) {
    throw new HttpsError('permission-denied', 'Email verification required.');
  }
  return request.auth;
}

async function assertAdmin(request: { auth?: { uid: string; token: Record<string, any> } }) {
  const caller = await assertVerifiedAuth(request);
  if (caller.token.admin === true || caller.token.email === BOOTSTRAP_OWNER_EMAIL) {
    return caller;
  }
  const adminSnap = await db.collection('admins').doc(caller.uid).get();
  if (!adminSnap.exists) {
    throw new HttpsError('permission-denied', 'Administrator privileges required.');
  }
  return caller;
}

function computeBestProductDiscountKobo(
  productId: string,
  priceKobo: number,
  discounts: Array<Record<string, any>>,
  nowMs: number
): number {
  let best = 0;
  for (const d of discounts) {
    if (!d.isActive) continue;
    const startMs = d.startAt?.toMillis ? d.startAt.toMillis() : 0;
    const endMs = d.endAt?.toMillis ? d.endAt.toMillis() : 0;
    if (nowMs < startMs || nowMs > endMs) continue;
    if (!Array.isArray(d.applicableProductIds) || !d.applicableProductIds.includes(productId))
      continue;

    let amount = 0;
    if (d.type === 'percentage') {
      const pct = Math.min(95, Math.max(1, Number(d.value) || 0));
      amount = Math.round((priceKobo * pct) / 100);
    } else if (d.type === 'fixed_kobo') {
      amount = Math.max(0, Math.round(Number(d.value) || 0));
    }
    amount = Math.min(amount, Math.max(0, priceKobo - 100));
    if (amount > best) best = amount;
  }
  return best;
}

async function loadStoreEmailContext(order: Record<string, any>, extra: Partial<EmailTemplateContext> = {}) {
  const [pubSnap, bankSnap, emailPrefSnap] = await Promise.all([
    db.collection('storeSettings').doc('public').get(),
    db.collection('storeSettings').doc('bankDetails').get(),
    db.collection('storeSettings').doc('emailPreferences').get(),
  ]);
  const pub = pubSnap.exists ? pubSnap.data()! : {};
  const bank = bankSnap.exists ? bankSnap.data()! : {};
  const emailPrefs = emailPrefSnap.exists ? emailPrefSnap.data()! : {};

  const appUrl = process.env.APP_URL || 'https://koramarket.ng';
  const addr = order.deliveryAddress || {};
  const deliveryAddressText = [addr.streetAddress, addr.city, addr.lga, addr.state]
    .filter(Boolean)
    .join(', ');

  const ctx: EmailTemplateContext = {
    storeName: pub.storeName || emailPrefs.senderName || process.env.BREVO_FROM_NAME || 'KoraMarket Nigeria',
    logoUrl: pub.logoUrl || '',
    contactEmail: pub.contactEmail || '',
    phoneNumber: pub.phoneNumber || '',
    businessAddress: pub.businessAddress || '',
    primaryColor: '#065F46',
    appUrl,
    orderNumber: order.orderNumber || '',
    orderId: order.orderId || '',
    customerName: order.customerSnapshot?.fullName || 'Valued Customer',
    customerEmail: order.customerSnapshot?.email || '',
    customerPhone: order.customerSnapshot?.phone || '',
    items: order.items || [],
    subtotalKobo: Number(order.subtotalKobo || 0),
    discountTotalKobo: Number(order.discountTotalKobo || 0),
    deliveryFeeKobo: Number(order.deliveryFeeKobo || 0),
    totalKobo: Number(order.totalKobo || 0),
    orderStatusLabel: ORDER_STATUS_LABELS[order.orderStatus] || order.orderStatus || 'Pending',
    paymentStatusLabel:
      PAYMENT_STATUS_LABELS[order.paymentStatus] || order.paymentStatus || 'Awaiting Payment',
    deliveryAddressText,
    bankDetails: {
      bankName: bank.bankName || '',
      accountName: bank.accountName || '',
      accountNumber: bank.accountNumber || '',
      transferInstructions: bank.transferInstructions || '',
    },
    timestampWat: formatLagosWat(),
    ...extra,
  };

  return { ctx, emailPrefs };
}

async function queueEmailNotificationIdempotent(params: {
  eventId: string;
  orderId: string;
  orderNumber: string;
  recipient: string;
  recipientType: 'customer' | 'admin';
  notificationType: string;
  subject: string;
  htmlBody: string;
}): Promise<string | null> {
  if (!isValidEmail(params.recipient) && params.recipient !== 'admin-configured') {
    return null;
  }

  // Deterministic document ID by eventId prevents duplicate sends across retries/concurrency
  const safeId = `em_${params.eventId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 118)}`;
  const docRef = db.collection('emailNotifications').doc(safeId);

  try {
    await docRef.create({
      notificationId: safeId,
      eventId: params.eventId,
      orderId: params.orderId,
      orderNumber: params.orderNumber,
      recipient: params.recipient,
      recipientType: params.recipientType,
      notificationType: params.notificationType,
      subject: params.subject,
      htmlBody: params.htmlBody,
      status: 'queued',
      deliveryStatus: 'pending',
      attemptCount: 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return safeId;
  } catch (err: any) {
    // ALREADY_EXISTS means idempotency key already queued/sent
    if (err?.code === 6 || String(err?.message || '').includes('ALREADY_EXISTS')) {
      return null;
    }
    console.error('Failed to enqueue email notification:', err);
    return null;
  }
}

async function dispatchOutboxEmailDoc(
  docSnap: FirebaseFirestore.DocumentSnapshot,
  brevoApiKey: string
): Promise<void> {
  const data = docSnap.data();
  if (!data || data.status === 'sent') return;

  const emailPrefSnap = await db.collection('storeSettings').doc('emailPreferences').get();
  const emailPrefs = emailPrefSnap.exists ? emailPrefSnap.data()! : {};
  const pubSnap = await db.collection('storeSettings').doc('public').get();
  const pub = pubSnap.exists ? pubSnap.data()! : {};

  let resolvedRecipient = String(data.recipient || '').trim();
  if (data.recipientType === 'admin' && resolvedRecipient === 'admin-configured') {
    resolvedRecipient = resolveAdminNotificationEmail(emailPrefs);
  }

  const attemptCount = Number(data.attemptCount || 0) + 1;

  if (emailPrefs.emailsEnabled === false) {
    await docSnap.ref.update({
      recipient: resolvedRecipient,
      status: 'failed',
      deliveryStatus: 'failed',
      attemptCount,
      failureReason: 'Email sending is disabled in Admin Email & Notifications Settings.',
      lastAttemptAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return;
  }

  const senderEmail = String(
    emailPrefs.senderEmail || process.env.BREVO_FROM_EMAIL || ''
  ).trim();
  const senderName = String(
    emailPrefs.senderName || process.env.BREVO_FROM_NAME || pub.storeName || 'KoraMarket Nigeria'
  ).trim();
  const replyTo = String(emailPrefs.replyToEmail || pub.contactEmail || '').trim();

  const result = await sendBrevoTransactionalEmail({
    apiKey: brevoApiKey,
    senderEmail,
    senderName,
    toEmail: resolvedRecipient,
    replyToEmail: replyTo,
    subject: String(data.subject || 'Order Notification'),
    htmlContent: String(data.htmlBody || `<p>${data.subject || 'Order Notification'}</p>`),
    headers: {
      'X-Order-Number': String(data.orderNumber || ''),
      'X-Notification-Event': String(data.eventId || docSnap.id),
    },
  });

  if (!result.ok) {
    await docSnap.ref.update({
      recipient: resolvedRecipient,
      status: 'failed',
      deliveryStatus: 'failed',
      attemptCount,
      failureReason: result.failureReason,
      lastAttemptAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return;
  }

  // Brevo accepted the request and returned messageId.
  // Final inbox delivery status is updated separately via brevoWebhook if configured.
  await docSnap.ref.update({
    recipient: resolvedRecipient,
    status: 'sent',
    deliveryStatus: 'accepted_by_provider',
    providerMessageId: result.messageId,
    attemptCount,
    failureReason: '',
    sentAt: FieldValue.serverTimestamp(),
    lastAttemptAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/**
 * 1. Bootstrap / Assign Admin Custom Claim (Server-Side Only)
 */
export const setAdminClaim = onCall(async (request) => {
  const caller = await assertAdmin(request);
  const { targetUid, email, grant } = request.data as {
    targetUid?: string;
    email?: string;
    grant?: boolean;
  };

  let userRecord;
  if (targetUid) {
    userRecord = await auth.getUser(targetUid);
  } else if (email) {
    userRecord = await auth.getUserByEmail(email);
  } else {
    throw new HttpsError('invalid-argument', 'Provide targetUid or email.');
  }

  const shouldGrant = grant !== false;
  await auth.setCustomUserClaims(userRecord.uid, {
    ...(userRecord.customClaims || {}),
    admin: shouldGrant,
  });

  if (shouldGrant) {
    await db.collection('admins').doc(userRecord.uid).set({
      uid: userRecord.uid,
      email: userRecord.email || '',
      grantedBy: caller.token.email || caller.uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    await db.collection('users').doc(userRecord.uid).set(
      { role: 'admin', updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
  } else {
    if (userRecord.uid === caller.uid) {
      throw new HttpsError('failed-precondition', 'Cannot revoke your own admin role.');
    }
    await db.collection('admins').doc(userRecord.uid).delete();
    await db.collection('users').doc(userRecord.uid).set(
      { role: 'customer', updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
  }

  await db.collection('auditLogs').doc().set({
    actorUid: caller.uid,
    actorEmail: caller.token.email || '',
    action: shouldGrant ? 'GRANT_ADMIN_ROLE' : 'REVOKE_ADMIN_ROLE',
    targetCollection: 'admins',
    targetId: userRecord.uid,
    details: `Target email: ${userRecord.email}`,
    createdAt: FieldValue.serverTimestamp(),
  });

  return { success: true, uid: userRecord.uid, admin: shouldGrant };
});

/**
 * 2. Server-Side Checkout Totals Calculation
 */
export const calculateCheckoutTotals = onCall(async (request) => {
  await assertVerifiedAuth(request);
  const { items, state, city } = request.data as {
    items: Array<{ productId: string; quantity: number }>;
    state: string;
    city?: string;
  };

  if (!Array.isArray(items) || items.length === 0) {
    throw new HttpsError('invalid-argument', 'Cart items are required.');
  }

  const nowMs = Date.now();
  const [discountsSnap, zonesSnap] = await Promise.all([
    db.collection('discounts').where('isActive', '==', true).get(),
    db.collection('deliveryZones').where('isActive', '==', true).get(),
  ]);
  const discounts = discountsSnap.docs.map((d) => d.data());
  const zones = zonesSnap.docs.map((d) => d.data());

  let subtotalKobo = 0;
  let discountTotalKobo = 0;

  for (const item of items) {
    const qty = Math.max(1, Math.floor(Number(item.quantity) || 0));
    const prodSnap = await db.collection('products').doc(item.productId).get();
    if (!prodSnap.exists || !prodSnap.data()?.isPublished) {
      throw new HttpsError('not-found', `Product ${item.productId} is unavailable.`);
    }
    const prod = prodSnap.data()!;
    if (prod.stockQuantity < qty) {
      throw new HttpsError('failed-precondition', `Insufficient stock for ${prod.name}.`);
    }
    const discPerUnit = computeBestProductDiscountKobo(
      item.productId,
      prod.priceKobo,
      discounts,
      nowMs
    );
    subtotalKobo += prod.priceKobo * qty;
    discountTotalKobo += discPerUnit * qty;
  }

  const normalizedState = (state || '').trim().toLowerCase();
  const normalizedCity = (city || '').trim().toLowerCase();
  const matchedZone = zones.find((z) => {
    const states = (z.supportedStates || []).map((s: string) => s.toLowerCase());
    if (!states.includes(normalizedState)) return false;
    const locs = (z.supportedLocations || []).map((l: string) => l.toLowerCase());
    if (locs.length === 0) return true;
    return locs.includes(normalizedCity) || locs.includes('all');
  });

  if (!matchedZone) {
    throw new HttpsError('failed-precondition', `Delivery is not yet supported for ${state}.`);
  }

  const netSubtotal = subtotalKobo - discountTotalKobo;
  const freeThreshold = Number(matchedZone.freeDeliveryThresholdKobo || 0);
  const deliveryFeeKobo =
    freeThreshold > 0 && netSubtotal >= freeThreshold ? 0 : Number(matchedZone.deliveryFeeKobo || 0);

  return {
    subtotalKobo,
    discountTotalKobo,
    deliveryFeeKobo,
    totalKobo: netSubtotal + deliveryFeeKobo,
    zoneId: matchedZone.zoneId,
    zoneName: matchedZone.name,
    estimatedDeliveryDays: matchedZone.estimatedDeliveryDays,
  };
});

/**
 * 3. Atomic Order Creation with Unique ORD-YYYYMMDD-XXXX Counter, Stock Deduction & Outbox Email Queuing
 */
export const createOrder = onCall(async (request) => {
  const caller = await assertVerifiedAuth(request);
  const { items, customerSnapshot, deliveryAddress, deliveryInstructions, idempotencyKey } =
    request.data as {
      items: Array<{
        productId: string;
        quantity: number;
        selectedVariants?: Record<string, string>;
      }>;
      customerSnapshot: { fullName: string; email: string; phone: string };
      deliveryAddress: {
        fullName: string;
        phone: string;
        state: string;
        lga: string;
        city: string;
        streetAddress: string;
      };
      deliveryInstructions?: string;
      idempotencyKey?: string;
    };

  if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
    throw new HttpsError('invalid-argument', 'Invalid order items.');
  }

  if (idempotencyKey) {
    const existingOrder = await db
      .collection('orders')
      .where('customerId', '==', caller.uid)
      .where('idempotencyKey', '==', idempotencyKey)
      .limit(1)
      .get();
    if (!existingOrder.empty) {
      const existingData = existingOrder.docs[0].data();
      return {
        orderId: existingOrder.docs[0].id,
        orderNumber: existingData.orderNumber,
        duplicate: true,
      };
    }
  }

  const nowMs = Date.now();
  const [discountsSnap, zonesSnap] = await Promise.all([
    db.collection('discounts').where('isActive', '==', true).get(),
    db.collection('deliveryZones').where('isActive', '==', true).get(),
  ]);

  const discounts = discountsSnap.docs.map((d) => d.data());
  const zones = zonesSnap.docs.map((d) => d.data());

  const normalizedState = (deliveryAddress.state || '').trim().toLowerCase();
  const normalizedCity = (deliveryAddress.city || '').trim().toLowerCase();
  const matchedZone = zones.find((z) => {
    const states = (z.supportedStates || []).map((s: string) => s.toLowerCase());
    if (!states.includes(normalizedState)) return false;
    const locs = (z.supportedLocations || []).map((l: string) => l.toLowerCase());
    if (locs.length === 0) return true;
    return locs.includes(normalizedCity) || locs.includes('all');
  });

  if (!matchedZone) {
    throw new HttpsError(
      'failed-precondition',
      `Delivery not supported in ${deliveryAddress.state}.`
    );
  }

  const orderRef = db.collection('orders').doc();
  let createdOrderData: Record<string, any> | null = null;
  let generatedOrderNumber = '';

  await db.runTransaction(async (tx) => {
    generatedOrderNumber = await generateNextOrderNumberInTx(tx);
    const orderItems: any[] = [];
    let subtotalKobo = 0;
    let discountTotalKobo = 0;

    for (const item of items) {
      const qty = Math.floor(Number(item.quantity));
      if (qty <= 0) throw new HttpsError('invalid-argument', 'Quantity must be positive.');
      const prodRef = db.collection('products').doc(item.productId);
      const prodSnap = await tx.get(prodRef);
      if (!prodSnap.exists || !prodSnap.data()?.isPublished) {
        throw new HttpsError('not-found', `Product ${item.productId} not found.`);
      }
      const prod = prodSnap.data()!;
      if (prod.stockQuantity < qty) {
        throw new HttpsError('failed-precondition', `Insufficient stock for ${prod.name}.`);
      }

      const discPerUnit = computeBestProductDiscountKobo(
        item.productId,
        prod.priceKobo,
        discounts,
        nowMs
      );
      const finalUnit = prod.priceKobo - discPerUnit;
      const lineTotal = finalUnit * qty;

      subtotalKobo += prod.priceKobo * qty;
      discountTotalKobo += discPerUnit * qty;

      orderItems.push({
        productId: prod.productId,
        productName: prod.name,
        slug: prod.slug,
        sku: prod.sku,
        image: prod.images?.[0] || '',
        selectedVariants: item.selectedVariants || {},
        quantity: qty,
        unitPriceKobo: prod.priceKobo,
        discountPerUnitKobo: discPerUnit,
        finalUnitPriceKobo: finalUnit,
        lineTotalKobo: lineTotal,
      });

      const newQty = prod.stockQuantity - qty;
      tx.update(prodRef, {
        stockQuantity: newQty,
        salesCount: (prod.salesCount || 0) + qty,
        updatedAt: FieldValue.serverTimestamp(),
      });

      const logRef = db.collection('inventoryLogs').doc();
      tx.set(logRef, {
        logId: logRef.id,
        productId: prod.productId,
        changeType: 'order_deduction',
        quantityChanged: -qty,
        previousQuantity: prod.stockQuantity,
        newQuantity: newQty,
        relatedOrderId: orderRef.id,
        performedBy: caller.uid,
        reason: `Order ${generatedOrderNumber} placed`,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    const netSubtotal = subtotalKobo - discountTotalKobo;
    const freeThreshold = Number(matchedZone.freeDeliveryThresholdKobo || 0);
    const deliveryFeeKobo =
      freeThreshold > 0 && netSubtotal >= freeThreshold ? 0 : Number(matchedZone.deliveryFeeKobo || 0);
    const totalKobo = netSubtotal + deliveryFeeKobo;

    const historyRef = db.collection('orderStatusHistory').doc();
    const initialHistoryEntry = {
      historyId: historyRef.id,
      orderId: orderRef.id,
      statusField: 'orderStatus',
      previousStatus: '',
      newStatus: 'pending',
      changedBy: caller.uid,
      changedByEmail: caller.token.email || customerSnapshot.email || '',
      changedByRole: 'customer',
      timestamp: Timestamp.now(),
      notes: 'Order placed by customer; awaiting store acknowledgement.',
    };

    createdOrderData = {
      orderId: orderRef.id,
      orderNumber: generatedOrderNumber,
      customerId: caller.uid,
      customerSnapshot,
      items: orderItems,
      subtotalKobo,
      discountTotalKobo,
      deliveryFeeKobo,
      totalKobo,
      currency: 'NGN',
      paymentMethod: 'bank_transfer',
      orderStatus: 'pending',
      paymentStatus: 'awaiting_payment',
      deliveryStatus: 'pending',
      deliveryAddress,
      deliveryZoneId: matchedZone.zoneId,
      deliveryInstructions: deliveryInstructions || '',
      statusHistory: [initialHistoryEntry],
      stockDeducted: true,
      idempotencyKey: idempotencyKey || '',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    tx.set(orderRef, createdOrderData);
    tx.set(historyRef, {
      ...initialHistoryEntry,
      customerId: caller.uid,
      timestamp: FieldValue.serverTimestamp(),
    });

    tx.delete(db.collection('carts').doc(caller.uid));

    const custNotifRef = db.collection('notifications').doc();
    tx.set(custNotifRef, {
      notificationId: custNotifRef.id,
      recipientId: caller.uid,
      type: 'order_placed',
      title: `Order ${generatedOrderNumber} Placed`,
      message: 'Please complete your bank transfer and upload your payment receipt.',
      relatedOrderId: orderRef.id,
      isRead: false,
      createdAt: FieldValue.serverTimestamp(),
    });

    const adminNotifRef = db.collection('notifications').doc();
    tx.set(adminNotifRef, {
      notificationId: adminNotifRef.id,
      recipientId: 'admin',
      type: 'new_order',
      title: `New Pending Order ${generatedOrderNumber}`,
      message: `${customerSnapshot.fullName} placed an order of ₦${(totalKobo / 100).toLocaleString('en-NG')} awaiting acknowledgement.`,
      relatedOrderId: orderRef.id,
      isRead: false,
      createdAt: FieldValue.serverTimestamp(),
    });
  });

  // Decoupled Outbox Email Queueing (failures here never break order placement)
  if (createdOrderData) {
    try {
      const { ctx, emailPrefs } = await loadStoreEmailContext(createdOrderData);
      const events = emailPrefs.events || {};

      if (events.orderPlacedCustomer !== false && isValidEmail(ctx.customerEmail)) {
        const mail = buildCustomerOrderPlacedEmail(ctx);
        await queueEmailNotificationIdempotent({
          eventId: `${orderRef.id}:order_placed:customer`,
          orderId: orderRef.id,
          orderNumber: generatedOrderNumber,
          recipient: ctx.customerEmail,
          recipientType: 'customer',
          notificationType: 'order_placed',
          subject: mail.subject,
          htmlBody: mail.html,
        });
      }

      if (events.orderPlacedAdmin !== false) {
        const adminEmail = resolveAdminNotificationEmail(emailPrefs);
        const mail = buildAdminNewOrderEmail(ctx);
        await queueEmailNotificationIdempotent({
          eventId: `${orderRef.id}:order_placed:admin`,
          orderId: orderRef.id,
          orderNumber: generatedOrderNumber,
          recipient: adminEmail,
          recipientType: 'admin',
          notificationType: 'order_placed',
          subject: mail.subject,
          htmlBody: mail.html,
        });
      }
    } catch (emailErr) {
      console.error('Order placed email queuing error (non-fatal):', emailErr);
    }
  }

  return { orderId: orderRef.id, orderNumber: generatedOrderNumber };
});

/**
 * 3b. Admin Action: MARK AS RECEIVED (Pending -> Received)
 */
export const markOrderReceived = onCall(async (request) => {
  const admin = await assertAdmin(request);
  const { orderId, notes } = request.data as { orderId: string; notes?: string };
  if (!orderId) throw new HttpsError('invalid-argument', 'orderId is required.');

  const orderRef = db.collection('orders').doc(orderId);
  let updatedOrderData: Record<string, any> | null = null;
  let transitioned = false;

  await db.runTransaction(async (tx) => {
    const oSnap = await tx.get(orderRef);
    if (!oSnap.exists) throw new HttpsError('not-found', 'Order not found.');
    const order = oSnap.data()!;
    const prevOrderStatus = order.orderStatus || 'pending';

    if (prevOrderStatus !== 'pending') {
      updatedOrderData = order;
      return;
    }

    transitioned = true;
    const historyRef = db.collection('orderStatusHistory').doc();
    const historyEntry = {
      historyId: historyRef.id,
      orderId,
      statusField: 'orderStatus',
      previousStatus: prevOrderStatus,
      newStatus: 'received',
      changedBy: admin.uid,
      changedByEmail: admin.token.email || '',
      changedByRole: 'admin',
      timestamp: Timestamp.now(),
      notes: notes || 'Order acknowledged and marked as Received by store administrator.',
    };

    const nextHistory = [...(Array.isArray(order.statusHistory) ? order.statusHistory : []), historyEntry];

    tx.update(orderRef, {
      orderStatus: 'received',
      deliveryStatus: order.deliveryStatus === 'pending' ? 'confirmed' : order.deliveryStatus,
      receivedAt: FieldValue.serverTimestamp(),
      receivedBy: admin.uid,
      receivedByEmail: admin.token.email || '',
      statusHistory: nextHistory,
      updatedAt: FieldValue.serverTimestamp(),
    });

    tx.set(historyRef, {
      ...historyEntry,
      customerId: order.customerId,
      timestamp: FieldValue.serverTimestamp(),
    });

    const custNotifRef = db.collection('notifications').doc();
    tx.set(custNotifRef, {
      notificationId: custNotifRef.id,
      recipientId: order.customerId,
      type: 'order_received',
      title: `Order ${order.orderNumber} Received`,
      message: 'Our team has received and acknowledged your order.',
      relatedOrderId: orderId,
      isRead: false,
      createdAt: FieldValue.serverTimestamp(),
    });

    const auditRef = db.collection('auditLogs').doc();
    tx.set(auditRef, {
      logId: auditRef.id,
      actorUid: admin.uid,
      actorEmail: admin.token.email || '',
      action: 'MARK_ORDER_RECEIVED',
      targetCollection: 'orders',
      targetId: orderId,
      details: `Order ${order.orderNumber} marked Received.`,
      createdAt: FieldValue.serverTimestamp(),
    });

    updatedOrderData = {
      ...order,
      orderStatus: 'received',
      deliveryStatus: order.deliveryStatus === 'pending' ? 'confirmed' : order.deliveryStatus,
    };
  });

  if (transitioned && updatedOrderData) {
    try {
      const { ctx, emailPrefs } = await loadStoreEmailContext(updatedOrderData);
      const events = emailPrefs.events || {};

      if (events.orderReceivedCustomer !== false && isValidEmail(ctx.customerEmail)) {
        const mail = buildCustomerOrderReceivedEmail(ctx);
        await queueEmailNotificationIdempotent({
          eventId: `${orderId}:order_received:customer`,
          orderId,
          orderNumber: ctx.orderNumber,
          recipient: ctx.customerEmail,
          recipientType: 'customer',
          notificationType: 'order_received',
          subject: mail.subject,
          htmlBody: mail.html,
        });
      }

      if (events.orderReceivedAdmin !== false) {
        const adminEmail = resolveAdminNotificationEmail(emailPrefs);
        const mail = buildAdminOrderReceivedEmail(ctx);
        await queueEmailNotificationIdempotent({
          eventId: `${orderId}:order_received:admin`,
          orderId,
          orderNumber: ctx.orderNumber,
          recipient: adminEmail,
          recipientType: 'admin',
          notificationType: 'order_received',
          subject: mail.subject,
          htmlBody: mail.html,
        });
      }
    } catch (err) {
      console.error('markOrderReceived email queue error (non-fatal):', err);
    }
  }

  return { success: true, transitioned };
});

/**
 * 4. Customer Bank Transfer Evidence Submission
 */
export const submitPayment = onCall(async (request) => {
  const caller = await assertVerifiedAuth(request);
  const { orderId, transferReference, transferDate, receiptImageUrl } = request.data as {
    orderId: string;
    transferReference: string;
    transferDate: string;
    receiptImageUrl?: string;
  };

  if (!orderId || !transferReference || !transferDate) {
    throw new HttpsError('invalid-argument', 'Missing payment submission fields.');
  }

  const paymentRef = db.collection('payments').doc();
  const orderRef = db.collection('orders').doc(orderId);
  let orderSnapshotData: Record<string, any> | null = null;

  await db.runTransaction(async (tx) => {
    const orderSnap = await tx.get(orderRef);
    if (!orderSnap.exists) throw new HttpsError('not-found', 'Order not found.');
    const order = orderSnap.data()!;
    if (order.customerId !== caller.uid) {
      throw new HttpsError('permission-denied', 'You can only submit payment for your own order.');
    }
    if (!['awaiting_payment', 'payment_rejected'].includes(order.paymentStatus)) {
      throw new HttpsError('failed-precondition', 'Payment cannot be submitted in current state.');
    }

    const historyRef = db.collection('orderStatusHistory').doc();
    const historyEntry = {
      historyId: historyRef.id,
      orderId,
      statusField: 'paymentStatus',
      previousStatus: order.paymentStatus,
      newStatus: 'payment_submitted',
      changedBy: caller.uid,
      changedByEmail: caller.token.email || '',
      changedByRole: 'customer',
      timestamp: Timestamp.now(),
      notes: `Transfer Ref: ${transferReference.trim()}`,
    };

    const nextHistory = [...(Array.isArray(order.statusHistory) ? order.statusHistory : []), historyEntry];

    tx.set(paymentRef, {
      paymentId: paymentRef.id,
      orderId,
      customerId: caller.uid,
      amountKobo: order.totalKobo,
      paymentMethod: 'bank_transfer',
      transferReference: transferReference.trim(),
      transferDate: transferDate.trim(),
      receiptImageUrl: receiptImageUrl || '',
      status: 'payment_submitted',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    tx.update(orderRef, {
      paymentStatus: 'payment_submitted',
      statusHistory: nextHistory,
      updatedAt: FieldValue.serverTimestamp(),
    });

    tx.set(historyRef, {
      ...historyEntry,
      customerId: caller.uid,
      timestamp: FieldValue.serverTimestamp(),
    });

    const adminNotifRef = db.collection('notifications').doc();
    tx.set(adminNotifRef, {
      notificationId: adminNotifRef.id,
      recipientId: 'admin',
      type: 'payment_submitted',
      title: `Payment Submitted: ${order.orderNumber}`,
      message: `Transfer ref ${transferReference} requires verification.`,
      relatedOrderId: orderId,
      isRead: false,
      createdAt: FieldValue.serverTimestamp(),
    });

    orderSnapshotData = { ...order, paymentStatus: 'payment_submitted' };
  });

  if (orderSnapshotData) {
    try {
      const { ctx, emailPrefs } = await loadStoreEmailContext(orderSnapshotData, {
        transferReference: transferReference.trim(),
        transferDate: transferDate.trim(),
      });
      const events = emailPrefs.events || {};

      if (events.paymentSubmittedCustomer !== false && isValidEmail(ctx.customerEmail)) {
        const mail = buildCustomerPaymentSubmittedEmail(ctx);
        await queueEmailNotificationIdempotent({
          eventId: `${orderId}:payment_submitted:${paymentRef.id}:customer`,
          orderId,
          orderNumber: ctx.orderNumber,
          recipient: ctx.customerEmail,
          recipientType: 'customer',
          notificationType: 'payment_submitted',
          subject: mail.subject,
          htmlBody: mail.html,
        });
      }

      if (events.paymentSubmittedAdmin !== false) {
        const adminEmail = resolveAdminNotificationEmail(emailPrefs);
        const mail = buildAdminPaymentSubmittedEmail(ctx);
        await queueEmailNotificationIdempotent({
          eventId: `${orderId}:payment_submitted:${paymentRef.id}:admin`,
          orderId,
          orderNumber: ctx.orderNumber,
          recipient: adminEmail,
          recipientType: 'admin',
          notificationType: 'payment_submitted',
          subject: mail.subject,
          htmlBody: mail.html,
        });
      }
    } catch (err) {
      console.error('submitPayment email queue error (non-fatal):', err);
    }
  }

  return { paymentId: paymentRef.id };
});

/**
 * 5. Admin Verify Payment (Confirm Bank Transfer)
 */
export const verifyPayment = onCall(async (request) => {
  const admin = await assertAdmin(request);
  const { paymentId, orderId, notes } = request.data as {
    paymentId: string;
    orderId: string;
    notes?: string;
  };

  const paymentRef = db.collection('payments').doc(paymentId);
  const orderRef = db.collection('orders').doc(orderId);
  let verifiedOrderData: Record<string, any> | null = null;

  await db.runTransaction(async (tx) => {
    const [pSnap, oSnap] = await Promise.all([tx.get(paymentRef), tx.get(orderRef)]);
    if (!pSnap.exists || !oSnap.exists) {
      throw new HttpsError('not-found', 'Payment or Order not found.');
    }
    const order = oSnap.data()!;

    const historyRef = db.collection('orderStatusHistory').doc();
    const historyEntry = {
      historyId: historyRef.id,
      orderId,
      statusField: 'paymentStatus',
      previousStatus: order.paymentStatus,
      newStatus: 'paid',
      changedBy: admin.uid,
      changedByEmail: admin.token.email || '',
      changedByRole: 'admin',
      timestamp: Timestamp.now(),
      notes: notes || 'Bank transfer verified and marked Paid.',
    };
    const nextHistory = [...(Array.isArray(order.statusHistory) ? order.statusHistory : []), historyEntry];

    tx.update(paymentRef, {
      status: 'paid',
      verificationNotes: notes || 'Bank transfer verified',
      verifiedBy: admin.uid,
      verifiedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    tx.update(orderRef, {
      paymentStatus: 'paid',
      statusHistory: nextHistory,
      updatedAt: FieldValue.serverTimestamp(),
    });

    tx.set(historyRef, {
      ...historyEntry,
      customerId: order.customerId,
      timestamp: FieldValue.serverTimestamp(),
    });

    const notifRef = db.collection('notifications').doc();
    tx.set(notifRef, {
      notificationId: notifRef.id,
      recipientId: order.customerId,
      type: 'payment_confirmed',
      title: `Payment Confirmed for ${order.orderNumber}`,
      message: 'Your bank transfer has been verified.',
      relatedOrderId: orderId,
      isRead: false,
      createdAt: FieldValue.serverTimestamp(),
    });

    const auditRef = db.collection('auditLogs').doc();
    tx.set(auditRef, {
      logId: auditRef.id,
      actorUid: admin.uid,
      actorEmail: admin.token.email || '',
      action: 'VERIFY_PAYMENT',
      targetCollection: 'payments',
      targetId: paymentId,
      details: `Order ${order.orderNumber} marked paid. Notes: ${notes || ''}`,
      createdAt: FieldValue.serverTimestamp(),
    });

    verifiedOrderData = { ...order, paymentStatus: 'paid' };
  });

  if (verifiedOrderData) {
    try {
      const { ctx, emailPrefs } = await loadStoreEmailContext(verifiedOrderData);
      const events = emailPrefs.events || {};

      if (events.paymentVerifiedCustomer !== false && isValidEmail(ctx.customerEmail)) {
        const mail = buildCustomerPaymentVerifiedEmail(ctx);
        await queueEmailNotificationIdempotent({
          eventId: `${orderId}:payment_verified:${paymentId}:customer`,
          orderId,
          orderNumber: ctx.orderNumber,
          recipient: ctx.customerEmail,
          recipientType: 'customer',
          notificationType: 'payment_verified',
          subject: mail.subject,
          htmlBody: mail.html,
        });
      }

      if (events.paymentVerifiedAdmin !== false) {
        const adminEmail = resolveAdminNotificationEmail(emailPrefs);
        const mail = buildAdminPaymentVerifiedEmail(ctx);
        await queueEmailNotificationIdempotent({
          eventId: `${orderId}:payment_verified:${paymentId}:admin`,
          orderId,
          orderNumber: ctx.orderNumber,
          recipient: adminEmail,
          recipientType: 'admin',
          notificationType: 'payment_verified',
          subject: mail.subject,
          htmlBody: mail.html,
        });
      }
    } catch (err) {
      console.error('verifyPayment email queue error (non-fatal):', err);
    }
  }

  return { success: true };
});

/**
 * 6. Admin Reject Payment
 */
export const rejectPayment = onCall(async (request) => {
  const admin = await assertAdmin(request);
  const { paymentId, orderId, reason } = request.data as {
    paymentId: string;
    orderId: string;
    reason: string;
  };

  if (!reason || reason.trim().length < 3) {
    throw new HttpsError('invalid-argument', 'A rejection reason is required.');
  }

  const paymentRef = db.collection('payments').doc(paymentId);
  const orderRef = db.collection('orders').doc(orderId);
  let rejectedOrderData: Record<string, any> | null = null;

  await db.runTransaction(async (tx) => {
    const [pSnap, oSnap] = await Promise.all([tx.get(paymentRef), tx.get(orderRef)]);
    if (!pSnap.exists || !oSnap.exists) {
      throw new HttpsError('not-found', 'Payment or Order not found.');
    }
    const order = oSnap.data()!;

    const historyRef = db.collection('orderStatusHistory').doc();
    const historyEntry = {
      historyId: historyRef.id,
      orderId,
      statusField: 'paymentStatus',
      previousStatus: order.paymentStatus,
      newStatus: 'payment_rejected',
      changedBy: admin.uid,
      changedByEmail: admin.token.email || '',
      changedByRole: 'admin',
      timestamp: Timestamp.now(),
      notes: reason.trim(),
    };
    const nextHistory = [...(Array.isArray(order.statusHistory) ? order.statusHistory : []), historyEntry];

    tx.update(paymentRef, {
      status: 'payment_rejected',
      verificationNotes: reason.trim(),
      verifiedBy: admin.uid,
      verifiedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    tx.update(orderRef, {
      paymentStatus: 'payment_rejected',
      statusHistory: nextHistory,
      updatedAt: FieldValue.serverTimestamp(),
    });

    tx.set(historyRef, {
      ...historyEntry,
      customerId: order.customerId,
      timestamp: FieldValue.serverTimestamp(),
    });

    const notifRef = db.collection('notifications').doc();
    tx.set(notifRef, {
      notificationId: notifRef.id,
      recipientId: order.customerId,
      type: 'payment_rejected',
      title: `Payment Rejected for ${order.orderNumber}`,
      message: `Reason: ${reason.trim()}. You may submit a corrected transfer receipt.`,
      relatedOrderId: orderId,
      isRead: false,
      createdAt: FieldValue.serverTimestamp(),
    });

    const auditRef = db.collection('auditLogs').doc();
    tx.set(auditRef, {
      logId: auditRef.id,
      actorUid: admin.uid,
      actorEmail: admin.token.email || '',
      action: 'REJECT_PAYMENT',
      targetCollection: 'payments',
      targetId: paymentId,
      details: `Order ${order.orderNumber} payment rejected. Reason: ${reason.trim()}`,
      createdAt: FieldValue.serverTimestamp(),
    });

    rejectedOrderData = { ...order, paymentStatus: 'payment_rejected' };
  });

  if (rejectedOrderData) {
    try {
      const { ctx, emailPrefs } = await loadStoreEmailContext(rejectedOrderData, {
        rejectionReason: reason.trim(),
      });
      const events = emailPrefs.events || {};

      if (events.paymentRejectedCustomer !== false && isValidEmail(ctx.customerEmail)) {
        const mail = buildCustomerPaymentRejectedEmail(ctx);
        await queueEmailNotificationIdempotent({
          eventId: `${orderId}:payment_rejected:${paymentId}:customer`,
          orderId,
          orderNumber: ctx.orderNumber,
          recipient: ctx.customerEmail,
          recipientType: 'customer',
          notificationType: 'payment_rejected',
          subject: mail.subject,
          htmlBody: mail.html,
        });
      }

      if (events.paymentRejectedAdmin !== false) {
        const adminEmail = resolveAdminNotificationEmail(emailPrefs);
        const mail = buildAdminPaymentRejectedEmail(ctx);
        await queueEmailNotificationIdempotent({
          eventId: `${orderId}:payment_rejected:${paymentId}:admin`,
          orderId,
          orderNumber: ctx.orderNumber,
          recipient: adminEmail,
          recipientType: 'admin',
          notificationType: 'payment_rejected',
          subject: mail.subject,
          htmlBody: mail.html,
        });
      }
    } catch (err) {
      console.error('rejectPayment email queue error (non-fatal):', err);
    }
  }

  return { success: true };
});

/**
 * 7. Admin Order Status & Stock Restoration on Cancellation + Stage Emails
 */
export const updateOrderStatus = onCall(async (request) => {
  const admin = await assertAdmin(request);
  const {
    orderId,
    orderStatus,
    deliveryStatus,
    deliveryTrackingNotes,
    deliveryPersonnel,
    adminNotes,
    cancellationReason,
  } = request.data as {
    orderId: string;
    orderStatus?: string;
    deliveryStatus?: string;
    deliveryTrackingNotes?: string;
    deliveryPersonnel?: string;
    adminNotes?: string;
    cancellationReason?: string;
  };

  const targetOrderStatus =
    orderStatus || (deliveryStatus === 'confirmed' ? 'received' : deliveryStatus) || 'pending';
  const targetDeliveryStatus =
    targetOrderStatus === 'received' ? 'confirmed' : deliveryStatus || targetOrderStatus;

  const orderRef = db.collection('orders').doc(orderId);
  let updatedOrderData: Record<string, any> | null = null;
  let prevStatus = '';
  let transitionHistoryId = '';

  await db.runTransaction(async (tx) => {
    const oSnap = await tx.get(orderRef);
    if (!oSnap.exists) throw new HttpsError('not-found', 'Order not found.');
    const order = oSnap.data()!;
    prevStatus = order.orderStatus || order.deliveryStatus || 'pending';

    const shouldRestoreStock =
      targetOrderStatus === 'cancelled' &&
      order.orderStatus !== 'cancelled' &&
      order.stockDeducted === true;

    if (shouldRestoreStock) {
      for (const item of order.items || []) {
        const prodRef = db.collection('products').doc(item.productId);
        const prodSnap = await tx.get(prodRef);
        if (prodSnap.exists) {
          const prevQty = Number(prodSnap.data()!.stockQuantity || 0);
          const newQty = prevQty + Number(item.quantity || 0);
          tx.update(prodRef, {
            stockQuantity: newQty,
            updatedAt: FieldValue.serverTimestamp(),
          });
          const logRef = db.collection('inventoryLogs').doc();
          tx.set(logRef, {
            logId: logRef.id,
            productId: item.productId,
            changeType: 'order_restoration',
            quantityChanged: Number(item.quantity || 0),
            previousQuantity: prevQty,
            newQuantity: newQty,
            relatedOrderId: orderId,
            performedBy: admin.uid,
            reason: `Order ${order.orderNumber} cancelled`,
            createdAt: FieldValue.serverTimestamp(),
          });
        }
      }
    }

    const historyRef = db.collection('orderStatusHistory').doc();
    transitionHistoryId = historyRef.id;
    const historyEntry = {
      historyId: historyRef.id,
      orderId,
      statusField: 'orderStatus',
      previousStatus: prevStatus,
      newStatus: targetOrderStatus,
      changedBy: admin.uid,
      changedByEmail: admin.token.email || '',
      changedByRole: 'admin',
      timestamp: Timestamp.now(),
      notes:
        targetOrderStatus === 'cancelled'
          ? cancellationReason || 'Cancelled by administrator'
          : deliveryTrackingNotes || `Status updated to ${ORDER_STATUS_LABELS[targetOrderStatus] || targetOrderStatus}`,
    };

    const nextHistory = [...(Array.isArray(order.statusHistory) ? order.statusHistory : []), historyEntry];

    const updates: Record<string, any> = {
      orderStatus: targetOrderStatus,
      deliveryStatus: targetDeliveryStatus,
      statusHistory: nextHistory,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (deliveryTrackingNotes !== undefined) updates.deliveryTrackingNotes = deliveryTrackingNotes;
    if (deliveryPersonnel !== undefined) updates.deliveryPersonnel = deliveryPersonnel;
    if (adminNotes !== undefined) updates.adminNotes = adminNotes;
    if (shouldRestoreStock) updates.stockDeducted = false;
    if (targetOrderStatus === 'received' && !order.receivedAt) {
      updates.receivedAt = FieldValue.serverTimestamp();
      updates.receivedBy = admin.uid;
      updates.receivedByEmail = admin.token.email || '';
    }
    if (targetOrderStatus === 'delivered' && !order.deliveredAt) {
      updates.deliveredAt = Timestamp.now();
    }
    if (targetOrderStatus === 'cancelled') {
      updates.cancelledAt = FieldValue.serverTimestamp();
      if (cancellationReason !== undefined) updates.cancellationReason = cancellationReason;
    }

    tx.update(orderRef, updates);

    tx.set(historyRef, {
      ...historyEntry,
      customerId: order.customerId,
      timestamp: FieldValue.serverTimestamp(),
    });

    const notifRef = db.collection('notifications').doc();
    tx.set(notifRef, {
      notificationId: notifRef.id,
      recipientId: order.customerId,
      type: `order_${targetOrderStatus}`,
      title: `Order ${order.orderNumber} Updated`,
      message: `Order status is now: ${ORDER_STATUS_LABELS[targetOrderStatus] || targetOrderStatus}.`,
      relatedOrderId: orderId,
      isRead: false,
      createdAt: FieldValue.serverTimestamp(),
    });

    const auditRef = db.collection('auditLogs').doc();
    tx.set(auditRef, {
      logId: auditRef.id,
      actorUid: admin.uid,
      actorEmail: admin.token.email || '',
      action: 'UPDATE_ORDER_STATUS',
      targetCollection: 'orders',
      targetId: orderId,
      details: `Order ${order.orderNumber} orderStatus -> ${targetOrderStatus}`,
      createdAt: FieldValue.serverTimestamp(),
    });

    updatedOrderData = { ...order, ...updates };
  });

  if (updatedOrderData && prevStatus !== targetOrderStatus) {
    try {
      const { ctx, emailPrefs } = await loadStoreEmailContext(updatedOrderData, {
        trackingNotes: deliveryTrackingNotes,
        deliveryPersonnel,
        cancellationReason,
      });
      const events = emailPrefs.events || {};

      if (targetOrderStatus === 'received') {
        if (events.orderReceivedCustomer !== false && isValidEmail(ctx.customerEmail)) {
          const mail = buildCustomerOrderReceivedEmail(ctx);
          await queueEmailNotificationIdempotent({
            eventId: `${orderId}:order_received:${transitionHistoryId}:customer`,
            orderId,
            orderNumber: ctx.orderNumber,
            recipient: ctx.customerEmail,
            recipientType: 'customer',
            notificationType: 'order_received',
            subject: mail.subject,
            htmlBody: mail.html,
          });
        }
        if (events.orderReceivedAdmin !== false) {
          const adminEmail = resolveAdminNotificationEmail(emailPrefs);
          const mail = buildAdminOrderReceivedEmail(ctx);
          await queueEmailNotificationIdempotent({
            eventId: `${orderId}:order_received:${transitionHistoryId}:admin`,
            orderId,
            orderNumber: ctx.orderNumber,
            recipient: adminEmail,
            recipientType: 'admin',
            notificationType: 'order_received',
            subject: mail.subject,
            htmlBody: mail.html,
          });
        }
      } else if (targetOrderStatus === 'processing') {
        if (events.orderProcessingCustomer !== false && isValidEmail(ctx.customerEmail)) {
          const mail = buildCustomerStatusStageEmail(ctx, 'order_processing');
          await queueEmailNotificationIdempotent({
            eventId: `${orderId}:order_processing:${transitionHistoryId}:customer`,
            orderId,
            orderNumber: ctx.orderNumber,
            recipient: ctx.customerEmail,
            recipientType: 'customer',
            notificationType: 'order_processing',
            subject: mail.subject,
            htmlBody: mail.html,
          });
        }
        if (events.orderProcessingAdmin !== false) {
          const adminEmail = resolveAdminNotificationEmail(emailPrefs);
          const mail = buildAdminStatusStageEmail(ctx, 'order_processing');
          await queueEmailNotificationIdempotent({
            eventId: `${orderId}:order_processing:${transitionHistoryId}:admin`,
            orderId,
            orderNumber: ctx.orderNumber,
            recipient: adminEmail,
            recipientType: 'admin',
            notificationType: 'order_processing',
            subject: mail.subject,
            htmlBody: mail.html,
          });
        }
      } else if (targetOrderStatus === 'ready_for_dispatch') {
        if (events.readyForDispatchCustomer !== false && isValidEmail(ctx.customerEmail)) {
          const mail = buildCustomerStatusStageEmail(ctx, 'ready_for_dispatch');
          await queueEmailNotificationIdempotent({
            eventId: `${orderId}:ready_for_dispatch:${transitionHistoryId}:customer`,
            orderId,
            orderNumber: ctx.orderNumber,
            recipient: ctx.customerEmail,
            recipientType: 'customer',
            notificationType: 'ready_for_dispatch',
            subject: mail.subject,
            htmlBody: mail.html,
          });
        }
        if (events.readyForDispatchAdmin !== false) {
          const adminEmail = resolveAdminNotificationEmail(emailPrefs);
          const mail = buildAdminStatusStageEmail(ctx, 'ready_for_dispatch');
          await queueEmailNotificationIdempotent({
            eventId: `${orderId}:ready_for_dispatch:${transitionHistoryId}:admin`,
            orderId,
            orderNumber: ctx.orderNumber,
            recipient: adminEmail,
            recipientType: 'admin',
            notificationType: 'ready_for_dispatch',
            subject: mail.subject,
            htmlBody: mail.html,
          });
        }
      } else if (targetOrderStatus === 'out_for_delivery') {
        if (events.outForDeliveryCustomer !== false && isValidEmail(ctx.customerEmail)) {
          const mail = buildCustomerStatusStageEmail(ctx, 'out_for_delivery');
          await queueEmailNotificationIdempotent({
            eventId: `${orderId}:out_for_delivery:${transitionHistoryId}:customer`,
            orderId,
            orderNumber: ctx.orderNumber,
            recipient: ctx.customerEmail,
            recipientType: 'customer',
            notificationType: 'out_for_delivery',
            subject: mail.subject,
            htmlBody: mail.html,
          });
        }
        if (events.outForDeliveryAdmin !== false) {
          const adminEmail = resolveAdminNotificationEmail(emailPrefs);
          const mail = buildAdminStatusStageEmail(ctx, 'out_for_delivery');
          await queueEmailNotificationIdempotent({
            eventId: `${orderId}:out_for_delivery:${transitionHistoryId}:admin`,
            orderId,
            orderNumber: ctx.orderNumber,
            recipient: adminEmail,
            recipientType: 'admin',
            notificationType: 'out_for_delivery',
            subject: mail.subject,
            htmlBody: mail.html,
          });
        }
      } else if (targetOrderStatus === 'delivered') {
        if (events.deliveredCustomer !== false && isValidEmail(ctx.customerEmail)) {
          const mail = buildCustomerStatusStageEmail(ctx, 'order_delivered');
          await queueEmailNotificationIdempotent({
            eventId: `${orderId}:order_delivered:${transitionHistoryId}:customer`,
            orderId,
            orderNumber: ctx.orderNumber,
            recipient: ctx.customerEmail,
            recipientType: 'customer',
            notificationType: 'order_delivered',
            subject: mail.subject,
            htmlBody: mail.html,
          });
        }
        if (events.deliveredAdmin !== false) {
          const adminEmail = resolveAdminNotificationEmail(emailPrefs);
          const mail = buildAdminStatusStageEmail(ctx, 'order_delivered');
          await queueEmailNotificationIdempotent({
            eventId: `${orderId}:order_delivered:${transitionHistoryId}:admin`,
            orderId,
            orderNumber: ctx.orderNumber,
            recipient: adminEmail,
            recipientType: 'admin',
            notificationType: 'order_delivered',
            subject: mail.subject,
            htmlBody: mail.html,
          });
        }
      } else if (targetOrderStatus === 'cancelled') {
        if (events.orderCancelledCustomer !== false && isValidEmail(ctx.customerEmail)) {
          const mail = buildOrderCancelledEmail(ctx, 'customer');
          await queueEmailNotificationIdempotent({
            eventId: `${orderId}:order_cancelled:${transitionHistoryId}:customer`,
            orderId,
            orderNumber: ctx.orderNumber,
            recipient: ctx.customerEmail,
            recipientType: 'customer',
            notificationType: 'order_cancelled',
            subject: mail.subject,
            htmlBody: mail.html,
          });
        }
        if (events.orderCancelledAdmin !== false) {
          const adminEmail = resolveAdminNotificationEmail(emailPrefs);
          const mail = buildOrderCancelledEmail(ctx, 'admin');
          await queueEmailNotificationIdempotent({
            eventId: `${orderId}:order_cancelled:${transitionHistoryId}:admin`,
            orderId,
            orderNumber: ctx.orderNumber,
            recipient: adminEmail,
            recipientType: 'admin',
            notificationType: 'order_cancelled',
            subject: mail.subject,
            htmlBody: mail.html,
          });
        }
      }
    } catch (err) {
      console.error('updateOrderStatus email queue error (non-fatal):', err);
    }
  }

  return { success: true };
});

/**
 * 7b. Admin Action: Record Completed Refund (Paid -> Refunded)
 */
export const recordRefundConfirmed = onCall(async (request) => {
  const admin = await assertAdmin(request);
  const { orderId, refundNotes } = request.data as { orderId: string; refundNotes: string };
  if (!orderId || !refundNotes || refundNotes.trim().length < 3) {
    throw new HttpsError('invalid-argument', 'Order ID and refund reference notes are required.');
  }

  const orderRef = db.collection('orders').doc(orderId);
  let refundedOrderData: Record<string, any> | null = null;

  await db.runTransaction(async (tx) => {
    const oSnap = await tx.get(orderRef);
    if (!oSnap.exists) throw new HttpsError('not-found', 'Order not found.');
    const order = oSnap.data()!;
    if (order.paymentStatus !== 'paid') {
      throw new HttpsError(
        'failed-precondition',
        'Only orders with verified Paid status can be marked Refunded.'
      );
    }

    const historyRef = db.collection('orderStatusHistory').doc();
    const historyEntry = {
      historyId: historyRef.id,
      orderId,
      statusField: 'paymentStatus',
      previousStatus: order.paymentStatus,
      newStatus: 'refunded',
      changedBy: admin.uid,
      changedByEmail: admin.token.email || '',
      changedByRole: 'admin',
      timestamp: Timestamp.now(),
      notes: refundNotes.trim(),
    };
    const nextHistory = [...(Array.isArray(order.statusHistory) ? order.statusHistory : []), historyEntry];

    tx.update(orderRef, {
      paymentStatus: 'refunded',
      refundedAt: FieldValue.serverTimestamp(),
      refundNotes: refundNotes.trim(),
      statusHistory: nextHistory,
      updatedAt: FieldValue.serverTimestamp(),
    });

    tx.set(historyRef, {
      ...historyEntry,
      customerId: order.customerId,
      timestamp: FieldValue.serverTimestamp(),
    });

    const auditRef = db.collection('auditLogs').doc();
    tx.set(auditRef, {
      logId: auditRef.id,
      actorUid: admin.uid,
      actorEmail: admin.token.email || '',
      action: 'RECORD_REFUND_CONFIRMED',
      targetCollection: 'orders',
      targetId: orderId,
      details: `Order ${order.orderNumber} refunded. Ref: ${refundNotes.trim()}`,
      createdAt: FieldValue.serverTimestamp(),
    });

    refundedOrderData = { ...order, paymentStatus: 'refunded', refundNotes: refundNotes.trim() };
  });

  if (refundedOrderData) {
    try {
      const { ctx, emailPrefs } = await loadStoreEmailContext(refundedOrderData, {
        refundNotes: refundNotes.trim(),
      });
      if (emailPrefs.events?.refundConfirmedCustomer !== false && isValidEmail(ctx.customerEmail)) {
        const mail = buildCustomerRefundConfirmedEmail(ctx);
        await queueEmailNotificationIdempotent({
          eventId: `${orderId}:refund_confirmed:customer`,
          orderId,
          orderNumber: ctx.orderNumber,
          recipient: ctx.customerEmail,
          recipientType: 'customer',
          notificationType: 'refund_confirmed',
          subject: mail.subject,
          htmlBody: mail.html,
        });
      }
      if (emailPrefs.events?.refundConfirmedAdmin !== false) {
        const adminEmail = resolveAdminNotificationEmail(emailPrefs);
        const mail = buildAdminRefundConfirmedEmail(ctx);
        await queueEmailNotificationIdempotent({
          eventId: `${orderId}:refund_confirmed:admin`,
          orderId,
          orderNumber: ctx.orderNumber,
          recipient: adminEmail,
          recipientType: 'admin',
          notificationType: 'refund_confirmed',
          subject: mail.subject,
          htmlBody: mail.html,
        });
      }
    } catch (err) {
      console.error('recordRefundConfirmed email queue error (non-fatal):', err);
    }
  }

  return { success: true };
});

/**
 * 8. Admin Dashboard Statistics (Verified Paid Revenue Only)
 */
export const adminGetDashboardStats = onCall(async (request) => {
  await assertAdmin(request);
  const [ordersSnap, usersSnap, productsSnap] = await Promise.all([
    db.collection('orders').get(),
    db.collection('users').where('role', '==', 'customer').get(),
    db.collection('products').get(),
  ]);

  let verifiedRevenueKobo = 0;
  let pendingAcknowledgement = 0;
  let awaitingVerification = 0;
  let completedOrders = 0;

  ordersSnap.docs.forEach((docSnap) => {
    const o = docSnap.data();
    const oStatus = o.orderStatus || o.deliveryStatus || 'pending';
    if (o.paymentStatus === 'paid') {
      verifiedRevenueKobo += Number(o.totalKobo || 0);
    }
    if (['payment_submitted', 'under_verification'].includes(o.paymentStatus)) {
      awaitingVerification += 1;
    }
    if (oStatus === 'pending') {
      pendingAcknowledgement += 1;
    }
    if (oStatus === 'delivered') {
      completedOrders += 1;
    }
  });

  const lowStockProducts = productsSnap.docs.filter(
    (d) => Number(d.data().stockQuantity || 0) <= 5
  ).length;

  return {
    verifiedRevenueKobo,
    totalOrders: ordersSnap.size,
    pendingAcknowledgement,
    awaitingVerification,
    completedOrders,
    totalCustomers: usersSnap.size,
    totalProducts: productsSnap.size,
    lowStockProducts,
  };
});

/**
 * 9. Admin Stock Adjustment
 */
export const adminAdjustInventory = onCall(async (request) => {
  const admin = await assertAdmin(request);
  const { productId, newQuantity, changeType, reason } = request.data as {
    productId: string;
    newQuantity: number;
    changeType: 'restock' | 'manual_adjustment';
    reason: string;
  };

  if (newQuantity < 0 || !Number.isInteger(newQuantity)) {
    throw new HttpsError('invalid-argument', 'Quantity must be a non-negative integer.');
  }

  const prodRef = db.collection('products').doc(productId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(prodRef);
    if (!snap.exists) throw new HttpsError('not-found', 'Product not found.');
    const prevQty = Number(snap.data()!.stockQuantity || 0);

    tx.update(prodRef, {
      stockQuantity: newQuantity,
      updatedAt: FieldValue.serverTimestamp(),
    });

    const logRef = db.collection('inventoryLogs').doc();
    tx.set(logRef, {
      logId: logRef.id,
      productId,
      changeType: changeType || 'manual_adjustment',
      quantityChanged: newQuantity - prevQty,
      previousQuantity: prevQty,
      newQuantity,
      performedBy: admin.uid,
      reason: reason || 'Manual stock adjustment',
      createdAt: FieldValue.serverTimestamp(),
    });
  });

  return { success: true };
});

/**
 * 10. Email Outbox Firestore Triggers & Retries (Brevo Integration)
 */
export const processEmailOutboxOnCreate = onDocumentCreated(
  {
    document: 'emailNotifications/{notificationId}',
    database: DATABASE_ID,
    secrets: [brevoApiKeySecret],
  },
  async (event) => {
    if (!event.data) return;
    await dispatchOutboxEmailDoc(event.data, brevoApiKeySecret.value());
  }
);

export const processEmailOutboxOnRequeue = onDocumentUpdated(
  {
    document: 'emailNotifications/{notificationId}',
    database: DATABASE_ID,
    secrets: [brevoApiKeySecret],
  },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after;
    if (!before || !after) return;
    const afterData = after.data();
    if (before.status !== 'queued' && afterData?.status === 'queued') {
      await dispatchOutboxEmailDoc(after, brevoApiKeySecret.value());
    }
  }
);

export const retryFailedEmailsSchedule = onSchedule(
  {
    schedule: 'every 5 minutes',
    secrets: [brevoApiKeySecret],
  },
  async () => {
    const snap = await db
      .collection('emailNotifications')
      .where('status', '==', 'failed')
      .limit(25)
      .get();

    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      const reason = String(data.failureReason || '');
      // Retry up to 3 automatic attempts only for transient errors (skip unconfigured key/sender failures)
      if (
        Number(data.attemptCount || 0) < 3 &&
        !reason.includes('BREVO_API_KEY') &&
        !reason.includes('Verified sender email')
      ) {
        await dispatchOutboxEmailDoc(docSnap, brevoApiKeySecret.value());
      }
    }
  }
);

export const sendTestEmail = onCall(
  { secrets: [brevoApiKeySecret] },
  async (request) => {
    const admin = await assertAdmin(request);
    const { recipientEmail } = request.data as { recipientEmail?: string };
    const emailPrefSnap = await db.collection('storeSettings').doc('emailPreferences').get();
    const emailPrefs = emailPrefSnap.exists ? emailPrefSnap.data()! : {};
    const targetEmail = (
      recipientEmail ||
      resolveAdminNotificationEmail(emailPrefs) ||
      admin.token.email ||
      ''
    ).trim();

    if (!isValidEmail(targetEmail)) {
      throw new HttpsError('invalid-argument', 'Valid recipient email is required.');
    }

    const senderName = String(
      emailPrefs.senderName || process.env.BREVO_FROM_NAME || 'KoraMarket Nigeria'
    ).trim();

    const notifRef = db.collection('emailNotifications').doc();
    const eventId = `test:${notifRef.id}`;
    await notifRef.set({
      notificationId: notifRef.id,
      eventId,
      orderId: '',
      orderNumber: 'TEST-EMAIL',
      recipient: targetEmail,
      recipientType: 'admin',
      notificationType: 'test_email',
      subject: `${senderName} – Email Configuration Test`,
      htmlBody: `<div style="font-family:sans-serif;padding:24px;"><h2>Email Configuration Test</h2><p>This test email confirms your Brevo transactional API integration and sender identity are operational for <strong>${senderName}</strong>.</p><p>Timestamp: ${formatLagosWat()}</p></div>`,
      status: 'queued',
      deliveryStatus: 'pending',
      attemptCount: 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    const freshSnap = await notifRef.get();
    await dispatchOutboxEmailDoc(freshSnap, brevoApiKeySecret.value());
    const afterSnap = await notifRef.get();
    const after = afterSnap.data()!;
    return {
      notificationId: notifRef.id,
      status: after.status,
      deliveryStatus: after.deliveryStatus,
      providerMessageId: after.providerMessageId || '',
      failureReason: after.failureReason || '',
    };
  }
);

export const retryFailedEmail = onCall(
  { secrets: [brevoApiKeySecret] },
  async (request) => {
    await assertAdmin(request);
    const { notificationId } = request.data as { notificationId: string };
    const ref = db.collection('emailNotifications').doc(notificationId);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError('not-found', 'Notification not found.');
    await dispatchOutboxEmailDoc(snap, brevoApiKeySecret.value());
    const updated = (await ref.get()).data()!;
    return {
      status: updated.status,
      deliveryStatus: updated.deliveryStatus,
      failureReason: updated.failureReason || '',
    };
  }
);

/**
 * 11. Brevo Delivery & Bounce Webhook Handler
 */
export const brevoWebhook = onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  const events = Array.isArray(req.body) ? req.body : [req.body];
  let updatedCount = 0;

  for (const evt of events) {
    if (!evt || typeof evt !== 'object') continue;
    const eventName = String(evt.event || evt.type || '');
    const messageId = String(evt['message-id'] || evt.messageId || '').trim();
    const mappedDelivery = mapBrevoWebhookEventToDeliveryStatus(eventName);
    if (!messageId || !mappedDelivery) continue;

    const matches = await db
      .collection('emailNotifications')
      .where('providerMessageId', '==', messageId)
      .limit(5)
      .get();

    for (const docSnap of matches.docs) {
      await docSnap.ref.update({
        deliveryStatus: mappedDelivery,
        updatedAt: FieldValue.serverTimestamp(),
      });
      updatedCount += 1;
    }
  }

  res.json({ ok: true, updated: updatedCount });
});

/**
 * 12. New Customer Account Created -> Admin Gmail Notification (Idempotent)
 */
export const onNewCustomerCreated = onDocumentCreated(
  {
    document: 'users/{uid}',
    database: DATABASE_ID,
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const userData = snap.data();
    if (!userData || userData.role === 'admin') return;

    const [pubSnap, emailPrefSnap] = await Promise.all([
      db.collection('storeSettings').doc('public').get(),
      db.collection('storeSettings').doc('emailPreferences').get(),
    ]);
    const pub = pubSnap.exists ? pubSnap.data()! : {};
    const emailPrefs = emailPrefSnap.exists ? emailPrefSnap.data()! : {};
    if (emailPrefs.emailsEnabled === false || emailPrefs.events?.newCustomerAdmin === false) {
      return;
    }

    const adminEmail = resolveAdminNotificationEmail(emailPrefs);
    const mail = buildAdminNewCustomerEmail({
      storeName:
        pub.storeName || emailPrefs.senderName || process.env.BREVO_FROM_NAME || 'KoraMarket Nigeria',
      logoUrl: pub.logoUrl || '',
      contactEmail: pub.contactEmail || '',
      phoneNumber: pub.phoneNumber || '',
      businessAddress: pub.businessAddress || '',
      primaryColor: '#065F46',
      appUrl: process.env.APP_URL || 'https://koramarket.ng',
      customerId: snap.id,
      customerName: String(userData.fullName || 'Customer'),
      customerEmail: String(userData.email || ''),
      customerPhone: String(userData.phone || ''),
      timestampWat: formatLagosWat(),
    });

    await queueEmailNotificationIdempotent({
      eventId: `user:${snap.id}:new_customer:admin`,
      orderId: '',
      orderNumber: 'NEW-CUSTOMER',
      recipient: adminEmail,
      recipientType: 'admin',
      notificationType: 'new_customer',
      subject: mail.subject,
      htmlBody: mail.html,
    });
  }
);


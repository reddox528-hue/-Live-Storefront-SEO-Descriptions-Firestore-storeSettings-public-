import { Discount, Product } from '../types/ecommerce';

/**
 * Format integer Kobo amount as Nigerian Naira (NGN).
 * Always uses Africa/Lagos and NGN conventions.
 */
export function formatNaira(kobo: number, showDecimals = false): string {
  const safeKobo = Number.isFinite(kobo) ? kobo : 0;
  const naira = safeKobo / 100;
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: showDecimals ? 2 : 0,
  }).format(naira);
}

/**
 * Convert Naira input (e.g., 15000.5) safely to integer Kobo.
 */
export function nairaToKobo(naira: number): number {
  if (!Number.isFinite(naira) || naira < 0) return 0;
  return Math.round(naira * 100);
}

export function koboToNairaNumber(kobo: number): number {
  if (!Number.isFinite(kobo)) return 0;
  return kobo / 100;
}

/**
 * Format Firestore Timestamp, Date, or ISO string for Nigeria (Africa/Lagos).
 */
export function formatLagosDateTime(value: any, includeTime = true): string {
  if (!value) return '—';
  let date: Date;
  if (typeof value?.toDate === 'function') {
    date = value.toDate();
  } else if (value?.seconds !== undefined) {
    date = new Date(value.seconds * 1000);
  } else {
    date = new Date(value);
  }
  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat('en-NG', {
    timeZone: 'Africa/Lagos',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(date);
}

export function toDateMillis(value: any): number {
  if (!value) return 0;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  if (value?.seconds !== undefined) return value.seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export interface ProductPricingResult {
  originalPriceKobo: number;
  discountAmountKobo: number;
  finalPriceKobo: number;
  activeDiscount: Discount | null;
  discountLabel: string | null;
}

export function computeProductPricing(
  product: Product,
  discounts: Discount[],
  nowMs = Date.now()
): ProductPricingResult {
  const originalPriceKobo = Math.max(0, Math.round(product.priceKobo));
  let bestDiscountAmount = 0;
  let bestDiscount: Discount | null = null;

  for (const discount of discounts) {
    if (!discount.isActive) continue;
    const startMs = toDateMillis(discount.startAt);
    const endMs = toDateMillis(discount.endAt);
    if (nowMs < startMs || nowMs > endMs) continue;
    if (!discount.applicableProductIds.includes(product.productId)) continue;

    let amount = 0;
    if (discount.type === 'percentage') {
      const pct = Math.min(95, Math.max(1, discount.value));
      amount = Math.round((originalPriceKobo * pct) / 100);
    } else if (discount.type === 'fixed_kobo') {
      amount = Math.max(0, discount.value);
    }

    // Prevent negative or zero prices
    amount = Math.min(amount, Math.max(0, originalPriceKobo - 100));
    if (amount > bestDiscountAmount) {
      bestDiscountAmount = amount;
      bestDiscount = discount;
    }
  }

  const finalPriceKobo = originalPriceKobo - bestDiscountAmount;
  let discountLabel: string | null = null;
  if (bestDiscount && bestDiscountAmount > 0) {
    discountLabel =
      bestDiscount.type === 'percentage'
        ? `-${bestDiscount.value}%`
        : `-${formatNaira(bestDiscountAmount)} Off`;
  }

  return {
    originalPriceKobo,
    discountAmountKobo: bestDiscountAmount,
    finalPriceKobo,
    activeDiscount: bestDiscount,
    discountLabel,
  };
}

export const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  received: 'Received',
  processing: 'Processing',
  ready_for_dispatch: 'Ready for Dispatch',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  awaiting_payment: 'Awaiting Payment',
  payment_submitted: 'Payment Submitted',
  under_verification: 'Under Verification',
  paid: 'Paid (Verified)',
  payment_rejected: 'Payment Rejected',
  refunded: 'Refunded',
};

export const DELIVERY_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  confirmed: 'Received / Confirmed',
  processing: 'Processing',
  ready_for_dispatch: 'Ready for Dispatch',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export const EMAIL_TYPE_LABELS: Record<string, string> = {
  order_placed: 'New Order Placed',
  order_pending: 'Order Pending Acknowledgement',
  order_received: 'Order Received / Acknowledged',
  payment_submitted: 'Payment Submission Received',
  payment_verified: 'Payment Verified & Confirmed',
  payment_rejected: 'Payment Rejected',
  order_processing: 'Order Processing',
  ready_for_dispatch: 'Ready for Dispatch',
  out_for_delivery: 'Out for Delivery',
  order_delivered: 'Delivered & Review Request',
  order_cancelled: 'Order Cancelled',
  refund_confirmed: 'Refund Confirmed',
  test_email: 'Admin Test Email',
};

export function mapOrderStatusToDeliveryStatus(orderStatus: string): string {
  if (orderStatus === 'received') return 'confirmed';
  return orderStatus;
}

export function deriveOrderStatus(order: { orderStatus?: string; deliveryStatus?: string }): string {
  if (order.orderStatus) return order.orderStatus;
  if (order.deliveryStatus === 'confirmed') return 'received';
  return order.deliveryStatus || 'pending';
}

export function getLagosDateKey(date = new Date()): string {
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

export function formatOrderNumberFromCounter(dateKey: string, sequence: number): string {
  const padded = String(Math.max(1, Math.floor(sequence))).padStart(4, '0');
  return `ORD-${dateKey}-${padded}`;
}


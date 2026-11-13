export type UserRole = 'customer' | 'admin';
export type AccountStatus = 'active' | 'suspended';

export type OrderStatus =
  | 'pending'
  | 'received'
  | 'processing'
  | 'ready_for_dispatch'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled';

export type PaymentStatus =
  | 'awaiting_payment'
  | 'payment_submitted'
  | 'under_verification'
  | 'paid'
  | 'payment_rejected'
  | 'refunded';

export type DeliveryStatus =
  | 'pending'
  | 'confirmed'
  | 'processing'
  | 'ready_for_dispatch'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled';

export type DiscountType = 'percentage' | 'fixed_kobo';

export type InventoryChangeType =
  | 'restock'
  | 'order_deduction'
  | 'order_restoration'
  | 'manual_adjustment';

export type EmailNotificationStatus = 'queued' | 'sent' | 'failed';

export type EmailProviderDeliveryStatus =
  | 'pending'
  | 'accepted_by_provider'
  | 'delivered'
  | 'bounced'
  | 'failed';

export type EmailNotificationType =
  | 'order_placed'
  | 'order_pending'
  | 'order_received'
  | 'payment_submitted'
  | 'payment_verified'
  | 'payment_rejected'
  | 'order_processing'
  | 'ready_for_dispatch'
  | 'out_for_delivery'
  | 'order_delivered'
  | 'order_cancelled'
  | 'refund_confirmed'
  | 'test_email';

export interface UserProfile {
  uid: string;
  fullName: string;
  email: string;
  phone?: string;
  role: UserRole;
  accountStatus: AccountStatus;
  createdAt: any;
  updatedAt: any;
}

export interface AdminRecord {
  uid: string;
  email: string;
  grantedBy?: string;
  createdAt: any;
}

export interface Category {
  categoryId: string;
  name: string;
  slug: string;
  description?: string;
  image?: string;
  displayOrder: number;
  isActive: boolean;
  createdAt: any;
  updatedAt: any;
}

export interface ProductVariant {
  name: string; // e.g., "Colour", "Size"
  options: string[]; // e.g., ["Obsidian", "Sand"]
}

export interface ProductSpecification {
  label: string;
  value: string;
}

export interface Product {
  productId: string;
  name: string;
  slug: string;
  description?: string;
  shortDescription?: string;
  categoryId: string;
  images: string[];
  sku: string;
  priceKobo: number;
  stockQuantity: number;
  variants?: ProductVariant[];
  specifications?: ProductSpecification[];
  salesCount?: number;
  isFeatured: boolean;
  isNewArrival: boolean;
  isPublished: boolean;
  createdAt: any;
  updatedAt: any;
}

export interface Discount {
  discountId: string;
  name: string;
  type: DiscountType;
  value: number; // percentage (1..95) or kobo
  applicableProductIds: string[];
  startAt: any;
  endAt: any;
  isActive: boolean;
  createdAt: any;
  updatedAt: any;
}

export interface CartItem {
  productId: string;
  quantity: number;
  selectedVariants?: Record<string, string>;
}

export interface CartDocument {
  cartId: string;
  customerId: string;
  items: CartItem[];
  createdAt: any;
  updatedAt: any;
}

export interface SavedAddress {
  addressId: string;
  customerId: string;
  fullName: string;
  phone: string;
  state: string;
  lga: string;
  city: string;
  streetAddress: string;
  additionalInstructions?: string;
  isDefault: boolean;
  createdAt: any;
  updatedAt: any;
}

export interface DeliveryZone {
  zoneId: string;
  name: string;
  supportedStates: string[];
  supportedLocations: string[];
  deliveryFeeKobo: number;
  estimatedDeliveryDays: string;
  freeDeliveryThresholdKobo?: number;
  isActive: boolean;
  createdAt: any;
  updatedAt: any;
}

export interface OrderCustomerSnapshot {
  fullName: string;
  email: string;
  phone: string;
}

export interface OrderAddressSnapshot {
  fullName: string;
  phone: string;
  state: string;
  lga: string;
  city: string;
  streetAddress: string;
}

export interface OrderItemSnapshot {
  productId: string;
  productName: string;
  slug: string;
  sku: string;
  image: string;
  selectedVariants?: Record<string, string>;
  quantity: number;
  unitPriceKobo: number;
  discountPerUnitKobo: number;
  finalUnitPriceKobo: number;
  lineTotalKobo: number;
}

export interface OrderStatusHistoryEntry {
  historyId?: string;
  orderId?: string;
  statusField: 'orderStatus' | 'paymentStatus' | 'deliveryStatus';
  previousStatus: string;
  newStatus: string;
  changedBy: string;
  changedByEmail?: string;
  changedByRole: 'customer' | 'admin' | 'system';
  timestamp: any;
  notes?: string;
}

export interface Order {
  orderId: string;
  orderNumber: string; // e.g., ORD-20261113-0001
  customerId: string;
  customerSnapshot: OrderCustomerSnapshot;
  items: OrderItemSnapshot[];
  subtotalKobo: number;
  discountTotalKobo: number;
  deliveryFeeKobo: number;
  totalKobo: number;
  currency: 'NGN';
  paymentMethod: 'bank_transfer';
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  deliveryStatus: DeliveryStatus;
  deliveryAddress: OrderAddressSnapshot;
  deliveryZoneId?: string;
  deliveryInstructions?: string;
  deliveryTrackingNotes?: string;
  deliveryPersonnel?: string;
  statusHistory?: OrderStatusHistoryEntry[];
  receivedAt?: any;
  receivedBy?: string;
  receivedByEmail?: string;
  deliveredAt?: any;
  cancelledAt?: any;
  cancellationReason?: string;
  refundedAt?: any;
  refundNotes?: string;
  adminNotes?: string;
  stockDeducted: boolean;
  idempotencyKey?: string;
  createdAt: any;
  updatedAt: any;
}

export interface PaymentSubmission {
  paymentId: string;
  orderId: string;
  customerId: string;
  amountKobo: number;
  paymentMethod: 'bank_transfer';
  transferReference: string;
  transferDate: string;
  receiptImageUrl?: string;
  status: 'payment_submitted' | 'under_verification' | 'paid' | 'payment_rejected' | 'refunded';
  verificationNotes?: string;
  verifiedBy?: string;
  verifiedAt?: any;
  createdAt: any;
  updatedAt: any;
}

export interface InventoryLog {
  logId: string;
  productId: string;
  changeType: InventoryChangeType;
  quantityChanged: number;
  previousQuantity: number;
  newQuantity: number;
  relatedOrderId?: string;
  performedBy: string;
  reason: string;
  createdAt: any;
}

export interface PromoBanner {
  id: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  ctaLink: string;
  image: string;
  isActive: boolean;
}

export interface StorePolicyContent {
  aboutUs: string;
  faq: { question: string; answer: string }[];
  privacyPolicy: string;
  termsAndConditions: string;
  shippingPolicy: string;
  returnsPolicy: string;
}

export interface StorePublicSettings {
  settingId: 'public';
  storeName: string;
  storeTagline: string;
  storeDescription: string;
  logoUrl: string;
  announcementText: string;
  announcementEnabled: boolean;
  heroTitle: string;
  heroSubtitle: string;
  heroCtaLabel: string;
  heroCtaLink: string;
  heroImageUrl: string;
  promoBanners: PromoBanner[];
  contactEmail: string;
  phoneNumber: string;
  whatsappNumber: string;
  businessAddress: string;
  socialLinks: {
    instagram?: string;
    twitter?: string;
    facebook?: string;
  };
  seoTitle: string;
  seoDescription: string;
  policies: StorePolicyContent;
  showFeaturedSection: boolean;
  showBestSellersSection: boolean;
  showNewArrivalsSection: boolean;
  showDiscountedSection: boolean;
  updatedAt: any;
}

export interface StoreBankSettings {
  settingId: 'bankDetails';
  bankName: string;
  accountName: string;
  accountNumber: string;
  transferInstructions: string;
  updatedAt: any;
}

export interface StorePrivateSettings {
  settingId: 'private';
  lowStockThreshold: number;
  orderNumberPrefix: string;
  notifyOnNewOrder: boolean;
  notifyOnPaymentSubmitted: boolean;
  notifyOnLowStock: boolean;
  internalOpsNotes: string;
  updatedAt: any;
}

export interface EmailEventPreferences {
  orderPlacedCustomer: boolean;
  orderPlacedAdmin: boolean;
  orderPendingNotice: boolean; // Kept false by default to avoid duplicate mail with orderPlacedCustomer
  orderReceivedCustomer: boolean;
  orderReceivedAdmin: boolean;
  paymentSubmittedCustomer: boolean;
  paymentSubmittedAdmin: boolean;
  paymentVerifiedCustomer: boolean;
  paymentVerifiedAdmin: boolean;
  paymentRejectedCustomer: boolean;
  paymentRejectedAdmin: boolean;
  orderProcessingCustomer: boolean;
  readyForDispatchCustomer: boolean;
  outForDeliveryCustomer: boolean;
  deliveredCustomer: boolean;
  orderCancelledCustomer: boolean;
  orderCancelledAdmin: boolean;
  refundConfirmedCustomer: boolean;
}

export interface EmailPreferencesSettings {
  settingId: 'emailPreferences';
  emailsEnabled: boolean;
  adminNotificationEmail: string;
  senderName: string;
  senderEmail: string;
  replyToEmail: string;
  events: EmailEventPreferences;
  updatedAt: any;
}

export interface EmailNotificationRecord {
  notificationId: string;
  eventId: string;
  orderId: string;
  orderNumber: string;
  recipient: string;
  recipientType: 'customer' | 'admin';
  notificationType: EmailNotificationType;
  subject: string;
  htmlBody?: string;
  status: EmailNotificationStatus;
  deliveryStatus?: EmailProviderDeliveryStatus;
  providerMessageId?: string;
  attemptCount: number;
  failureReason?: string;
  createdAt: any;
  updatedAt?: any;
  lastAttemptAt?: any;
  sentAt?: any;
}

export interface ProductReview {
  reviewId: string;
  productId: string;
  orderId: string;
  customerId: string;
  customerName: string;
  rating: number;
  comment: string;
  isApproved: boolean;
  createdAt: any;
  updatedAt: any;
}

export interface AppNotification {
  notificationId: string;
  recipientId: string; // customer uid or 'admin'
  type: string;
  title: string;
  message: string;
  relatedOrderId?: string;
  isRead: boolean;
  createdAt: any;
}

export interface AuditLog {
  logId: string;
  actorUid: string;
  actorEmail?: string;
  action: string;
  targetCollection: string;
  targetId: string;
  details?: string;
  createdAt: any;
}

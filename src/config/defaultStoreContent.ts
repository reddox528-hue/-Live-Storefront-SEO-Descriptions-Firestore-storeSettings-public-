import { CATALOG_IMAGES } from '../assets/catalogImages';
import { StoreBankSettings, StorePrivateSettings, StorePublicSettings } from '../types/ecommerce';

export const DEFAULT_PUBLIC_SETTINGS: Omit<StorePublicSettings, 'updatedAt'> = {
  settingId: 'public',
  storeName: 'KoraMarket',
  storeTagline: 'Curated Everyday Goods Across Nigeria',
  storeDescription:
    'Thoughtfully sourced electronics, home living, leather goods, and botanical skincare — priced transparently in Nigerian Naira with verified bank-transfer checkout and owner-managed delivery.',
  logoUrl: '',
  announcementText: 'Lagos & Abuja Express Dispatch · Bank Transfer Verified Within 30 Mins',
  announcementEnabled: true,
  heroTitle: 'Everyday Craftsmanship, Delivered Across Nigeria',
  heroSubtitle:
    'Shop curated electronics, studio homeware, full-grain leather, and botanical skincare in Naira with direct owner-managed delivery.',
  heroCtaLabel: 'Explore Catalogue',
  heroCtaLink: '/shop',
  heroImageUrl: CATALOG_IMAGES.heroModernCommerce,
  promoBanners: [
    {
      id: 'promo-lagos-home',
      title: 'Studio Homeware & Warm Brass Lighting',
      subtitle: 'Hand-finished stoneware and architectural desk lamps ready for dispatch from Lagos.',
      ctaLabel: 'Shop Home Living',
      ctaLink: '/category/home-living',
      image: CATALOG_IMAGES.homeCeramics,
      isActive: true,
    },
  ],
  contactEmail: 'hello@koramarket.ng',
  phoneNumber: '+234 800 567 2627',
  whatsappNumber: '+234 800 567 2627',
  businessAddress: '14 Admiralty Way, Lekki Phase 1, Lagos, Nigeria',
  socialLinks: {
    instagram: 'https://instagram.com',
    twitter: 'https://x.com',
    facebook: 'https://facebook.com',
  },
  seoTitle: 'KoraMarket Nigeria – Curated Everyday Goods in Naira',
  seoDescription:
    'Shop curated electronics, home living, leather bags, and botanical skincare in Nigerian Naira with verified bank-transfer checkout.',
  policies: {
    aboutUs:
      'KoraMarket is a Lagos-based Nigerian e-commerce store focused on durable everyday essentials across electronics, homeware, leather accessories, and botanical skincare. Every order is inspected by our team before dispatch and delivered directly across supported Nigerian states.',
    faq: [
      {
        question: 'How do I pay for my order?',
        answer:
          'We accept direct Nigerian Naira bank transfers only. After placing your order, you will see our bank account details, exact NGN total, and your unique order reference. Transfer the exact amount and upload your receipt or transfer reference on the confirmation page.',
      },
      {
        question: 'How long does payment verification take?',
        answer:
          'Our finance team verifies submitted bank transfers within 15 to 60 minutes during business hours (Monday–Saturday, 8:00 AM – 6:00 PM WAT). Once confirmed, your order moves immediately to processing.',
      },
      {
        question: 'Which states do you deliver to?',
        answer:
          'We currently manage direct deliveries across Lagos, Abuja FCT, Ogun, Oyo, Rivers, and major cities nationwide through our configured delivery zones. Exact delivery fees and estimated days are calculated at checkout based on your state.',
      },
      {
        question: 'Can I return an item if it arrives damaged or incorrect?',
        answer:
          'Yes. Eligible unused items in original packaging can be returned within 7 days of delivery. Contact our support desk with your order number to initiate a verified inspection and refund.',
      },
    ],
    privacyPolicy:
      'We collect only the personal details required to process your orders, verify bank-transfer payments, and coordinate delivery across Nigeria (full name, email address, phone number, and delivery address). Your account data is isolated via strict access controls and never sold to third parties.',
    termsAndConditions:
      'All prices on KoraMarket are stated in Nigerian Naira (₦). Orders are reserved upon submission and confirmed for dispatch once bank-transfer payment is verified by an administrator. Availability and pricing are validated on the server at checkout.',
    shippingPolicy:
      'All deliveries are managed directly by our operations team. Dispatch timelines vary by Nigerian delivery zone: Lagos Metro (1–2 business days), Abuja FCT & South-West (2–4 business days), and Nationwide Express (3–6 business days).',
    returnsPolicy:
      'Unused items in original sealed packaging may be returned within 7 days of delivery. Once inspected, eligible refunds are processed via bank transfer to your designated Nigerian bank account within 3–5 business days.',
  },
  showFeaturedSection: true,
  showBestSellersSection: true,
  showNewArrivalsSection: true,
  showDiscountedSection: true,
};

export const DEFAULT_BANK_SETTINGS: Omit<StoreBankSettings, 'updatedAt'> = {
  settingId: 'bankDetails',
  bankName: 'Guaranty Trust Bank (GTBank)',
  accountName: 'KoraMarket Retail Nigeria Ltd',
  accountNumber: '0123456789',
  transferInstructions:
    'Please include your Order Number in the bank transfer narration/remark. Upload your transfer receipt screenshot or PDF immediately after payment so our team can verify and dispatch your order.',
};

export const DEFAULT_PRIVATE_SETTINGS: Omit<StorePrivateSettings, 'updatedAt'> = {
  settingId: 'private',
  lowStockThreshold: 5,
  orderNumberPrefix: 'ORD',
  notifyOnNewOrder: true,
  notifyOnPaymentSubmitted: true,
  notifyOnLowStock: true,
  internalOpsNotes: 'Standard verification SLA: 30 minutes during business hours (WAT).',
};

export const DEFAULT_EMAIL_PREFERENCES: Omit<
  import('../types/ecommerce').EmailPreferencesSettings,
  'updatedAt'
> = {
  settingId: 'emailPreferences',
  emailsEnabled: true,
  adminNotificationEmail: 'reddox528@gmail.com',
  senderName: 'KoraMarket Nigeria',
  senderEmail: '',
  replyToEmail: 'hello@koramarket.ng',
  events: {
    orderPlacedCustomer: true,
    orderPlacedAdmin: true,
    orderPendingNotice: false,
    orderReceivedCustomer: true,
    orderReceivedAdmin: true,
    paymentSubmittedCustomer: true,
    paymentSubmittedAdmin: true,
    paymentVerifiedCustomer: true,
    paymentVerifiedAdmin: true,
    paymentRejectedCustomer: true,
    paymentRejectedAdmin: true,
    orderProcessingCustomer: true,
    readyForDispatchCustomer: true,
    outForDeliveryCustomer: true,
    deliveredCustomer: true,
    orderCancelledCustomer: true,
    orderCancelledAdmin: true,
    refundConfirmedCustomer: true,
  },
};


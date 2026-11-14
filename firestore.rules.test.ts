import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  computeProductPricing,
  deriveOrderStatus,
  formatLagosDateTime,
  formatNaira,
  formatOrderNumberFromCounter,
  getLagosDateKey,
  mapOrderStatusToDeliveryStatus,
  nairaToKobo,
  EMAIL_TYPE_LABELS,
} from './src/utils/nigerianCurrency';
import {
  buildAdminNewCustomerEmail,
  buildAdminNewOrderEmail,
  buildAdminPaymentSubmittedEmail,
  buildAdminRefundConfirmedEmail,
  buildAdminStatusStageEmail,
  buildCustomerOrderPlacedEmail,
  buildCustomerOrderReceivedEmail,
  buildCustomerPaymentRejectedEmail,
  buildCustomerPaymentSubmittedEmail,
  buildCustomerPaymentVerifiedEmail,
  buildCustomerRefundConfirmedEmail,
  EmailTemplateContext,
} from './src/utils/emailTemplates';
import { DEFAULT_EMAIL_PREFERENCES } from './src/config/defaultStoreContent';
import { matchDeliveryZone, NIGERIAN_STATES } from './src/utils/nigeriaLocations';
import { DeliveryZone, Discount, Product } from './src/types/ecommerce';
import {
  BREVO_API_ENDPOINT,
  buildBrevoPayload,
  mapBrevoWebhookEventToDeliveryStatus,
  sendBrevoTransactionalEmail,
} from './functions/src/brevoClient';
import { resolveImageUrl } from './src/utils/imageUrl';
import { CATALOG_IMAGES } from './src/assets/catalogImages';
import {
  formatAuthError,
  validateEmailFormat,
  validateResetPasswordForm,
} from './src/utils/authErrors';

const sampleProduct: Product = {
  productId: 'prod-1',
  name: 'Studio Wireless Headphones',
  slug: 'studio-wireless-headphones',
  sku: 'KM-AUD-001',
  categoryId: 'cat-audio',
  description: 'Studio audio headphones',
  shortDescription: 'Wireless headphones',
  priceKobo: 4500000, // ₦45,000
  stockQuantity: 12,
  images: [],
  variants: [],
  specifications: [],
  isFeatured: true,
  isNewArrival: false,
  isPublished: true,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

const sampleZones: DeliveryZone[] = [
  {
    zoneId: 'zone-lagos-island',
    name: 'Lagos Island & Lekki',
    supportedStates: ['Lagos'],
    supportedLocations: ['Lekki', 'Victoria Island', 'Ikoyi'],
    deliveryFeeKobo: 250000, // ₦2,500
    freeDeliveryThresholdKobo: 15000000, // ₦150,000
    estimatedDeliveryDays: '1–2 business days',
    isActive: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    zoneId: 'zone-abuja',
    name: 'Abuja FCT',
    supportedStates: ['FCT Abuja'],
    supportedLocations: [],
    deliveryFeeKobo: 500000, // ₦5,000
    estimatedDeliveryDays: '2–4 business days',
    isActive: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    zoneId: 'zone-inactive',
    name: 'Paused Zone',
    supportedStates: ['Kano'],
    supportedLocations: [],
    deliveryFeeKobo: 450000,
    estimatedDeliveryDays: '4–5 days',
    isActive: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
];

test('NGN kobo conversion and Nigerian Naira formatting', () => {
  assert.equal(nairaToKobo(45000), 4500000);
  assert.equal(nairaToKobo(2499.5), 249950);
  assert.equal(formatNaira(4500000), '₦45,000');
  assert.equal(formatNaira(249950, true), '₦2,499.50');
  assert.equal(formatNaira(0), '₦0');
});

test('WAT (Africa/Lagos) date formatting renders consistently', () => {
  const formatted = formatLagosDateTime(Date.UTC(2026, 4, 10, 12, 0, 0));
  assert.ok(formatted.includes('2026'));
  assert.ok(formatted.length > 6);
});

test('Unique order ID generation formats ORD-YYYYMMDD-XXXX without PII', () => {
  const dateKey = getLagosDateKey(new Date(Date.UTC(2026, 10, 13, 10, 0, 0)));
  assert.equal(dateKey, '20261113');

  const first = formatOrderNumberFromCounter(dateKey, 1);
  const second = formatOrderNumberFromCounter(dateKey, 2);
  const overflow = formatOrderNumberFromCounter(dateKey, 10042);

  assert.equal(first, 'ORD-20261113-0001');
  assert.equal(second, 'ORD-20261113-0002');
  assert.equal(overflow, 'ORD-20261113-10042');
  assert.notEqual(first, second);
  assert.match(first, /^ORD-[0-9]{8}-[0-9]{4,}$/);
});

test('OrderStatus and DeliveryStatus remain independent and map accurately', () => {
  assert.equal(deriveOrderStatus({ deliveryStatus: 'confirmed' }), 'received');
  assert.equal(deriveOrderStatus({ orderStatus: 'received', deliveryStatus: 'pending' }), 'received');
  assert.equal(mapOrderStatusToDeliveryStatus('received'), 'confirmed');
  assert.equal(mapOrderStatusToDeliveryStatus('ready_for_dispatch'), 'ready_for_dispatch');
});

test('Nigeria states list covers all 36 states plus FCT Abuja', () => {
  assert.equal(NIGERIAN_STATES.length, 37);
  assert.ok(NIGERIAN_STATES.includes('Lagos'));
  assert.ok(NIGERIAN_STATES.includes('FCT Abuja'));
});

test('Product pricing respects percentage and fixed_kobo discounts within active window', () => {
  const now = Date.now();
  const activePercentDiscount: Discount = {
    discountId: 'disc-1',
    name: '10% Audio Deal',
    type: 'percentage',
    value: 10,
    applicableProductIds: ['prod-1'],
    isActive: true,
    startAt: now - 60_000,
    endAt: now + 60_000,
    createdAt: now,
    updatedAt: now,
  };

  const pricing = computeProductPricing(sampleProduct, [activePercentDiscount], now);
  assert.equal(pricing.originalPriceKobo, 4500000);
  assert.equal(pricing.finalPriceKobo, 4050000);
  assert.equal(pricing.discountAmountKobo, 450000);
  assert.equal(pricing.discountLabel, '-10%');

  const fixedDiscount: Discount = {
    discountId: 'disc-2',
    name: '₦5,000 Off Audio',
    type: 'fixed_kobo',
    value: 500000,
    applicableProductIds: ['prod-1'],
    isActive: true,
    startAt: now - 60_000,
    endAt: now + 60_000,
    createdAt: now,
    updatedAt: now,
  };

  const fixedPricing = computeProductPricing(sampleProduct, [fixedDiscount], now);
  assert.equal(fixedPricing.finalPriceKobo, 4000000);
  assert.equal(fixedPricing.discountAmountKobo, 500000);

  // Expired discount must not apply
  const expiredDiscount: Discount = {
    ...activePercentDiscount,
    endAt: now - 1000,
  };
  const expiredPricing = computeProductPricing(sampleProduct, [expiredDiscount], now);
  assert.equal(expiredPricing.finalPriceKobo, 4500000);
  assert.equal(expiredPricing.discountAmountKobo, 0);
});

test('Delivery zone matching enforces active Nigerian states, city locations, and unsupported state blocking', () => {
  const lekkiZone = matchDeliveryZone(sampleZones, 'Lagos', 'Lekki');
  assert.equal(lekkiZone?.zoneId, 'zone-lagos-island');

  // Unsupported city in Lagos when zone specifies locations must fail
  assert.equal(matchDeliveryZone(sampleZones, 'Lagos', 'Badagry'), null);

  const abujaZone = matchDeliveryZone(sampleZones, 'FCT Abuja', 'Wuse II');
  assert.equal(abujaZone?.zoneId, 'zone-abuja');

  // Inactive or unconfigured states return null (blocking checkout)
  assert.equal(matchDeliveryZone(sampleZones, 'Kano', 'Nassarawa'), null);
  assert.equal(matchDeliveryZone(sampleZones, 'Enugu', 'Enugu North'), null);
});

test('Automated HTML email templates render order IDs, NGN totals, bank instructions, and event subjects', () => {
  const ctx: EmailTemplateContext = {
    storeName: 'KoraMarket Nigeria',
    contactEmail: 'hello@koramarket.ng',
    phoneNumber: '+234 800 000 0000',
    businessAddress: '14 Admiralty Way, Lekki Phase 1, Lagos',
    appUrl: 'https://koramarket.ng',
    orderNumber: 'ORD-20261113-0001',
    orderId: 'ord_123',
    customerName: 'Chinedu Okafor',
    customerEmail: 'chinedu@example.com',
    customerPhone: '08031234567',
    items: [
      {
        productName: 'Studio Wireless Headphones',
        quantity: 2,
        finalUnitPriceKobo: 4050000,
        lineTotalKobo: 8100000,
      },
    ],
    subtotalKobo: 9000000,
    discountTotalKobo: 900000,
    deliveryFeeKobo: 250000,
    totalKobo: 8350000,
    orderStatusLabel: 'Pending',
    paymentStatusLabel: 'Awaiting Payment',
    deliveryAddressText: '12 Adeola Odeku, Lekki, Lagos',
    bankDetails: {
      bankName: 'GTBank',
      accountName: 'KoraMarket Nigeria Ltd',
      accountNumber: '0123456789',
      transferInstructions: 'Use ORD-20261113-0001 as narration.',
    },
    transferReference: 'TRF-998877',
    rejectionReason: 'Blurred receipt upload',
    refundNotes: 'GTBank reversal REF-5544',
    timestampWat: '13 Nov 2026, 10:15 WAT',
  };

  const placedCust = buildCustomerOrderPlacedEmail(ctx);
  assert.equal(placedCust.subject, 'Your Order Has Been Placed – ORD-20261113-0001');
  assert.ok(placedCust.html.includes('ORD-20261113-0001'));
  assert.ok(placedCust.html.includes('Chinedu Okafor'));
  assert.ok(placedCust.html.includes('GTBank'));
  assert.ok(placedCust.html.includes('83,500'));

  const placedAdmin = buildAdminNewOrderEmail(ctx);
  assert.equal(placedAdmin.subject, 'New Order Received – ORD-20261113-0001');
  assert.ok(placedAdmin.html.includes('/admin/orders/ord_123'));
  assert.ok(placedAdmin.html.includes('Nigerian Bank Transfer'));
  assert.ok(placedAdmin.html.includes('08031234567'));
  assert.ok(placedAdmin.html.includes('12 Adeola Odeku, Lekki, Lagos'));
  assert.ok(placedAdmin.html.includes('83,500'));

  const paySubAdmin = buildAdminPaymentSubmittedEmail(ctx);
  assert.equal(paySubAdmin.subject, 'Payment Verification Required – ORD-20261113-0001');
  assert.ok(paySubAdmin.html.includes('TRF-998877'));
  assert.ok(paySubAdmin.html.includes('13 Nov 2026, 10:15 WAT'));
  assert.ok(paySubAdmin.html.includes('/admin/orders/ord_123'));

  const newCustAdmin = buildAdminNewCustomerEmail({
    storeName: 'KoraMarket Nigeria',
    appUrl: 'https://koramarket.ng',
    customerId: 'uid_customer_1',
    customerName: 'Chinedu Okafor',
    customerEmail: 'chinedu@example.com',
    customerPhone: '08031234567',
    timestampWat: '13 Nov 2026, 10:15 WAT',
  });
  assert.equal(newCustAdmin.subject, 'New Customer Registered – Chinedu Okafor');
  assert.ok(newCustAdmin.html.includes('chinedu@example.com'));
  assert.ok(newCustAdmin.html.includes('/admin/customers'));
  assert.doesNotMatch(newCustAdmin.html, /password|BREVO_API_KEY|xkeysib/i);

  for (const stage of ['order_processing', 'ready_for_dispatch', 'out_for_delivery', 'order_delivered'] as const) {
    const stageEmail = buildAdminStatusStageEmail(
      {
        ...ctx,
        deliveryPersonnel: 'GIG Logistics',
        trackingNotes: 'GIG-12345',
      },
      stage
    );
    assert.ok(stageEmail.subject.includes('ORD-20261113-0001'));
    assert.ok(stageEmail.html.includes('/admin/orders/ord_123'));
  }

  const refundAdmin = buildAdminRefundConfirmedEmail(ctx);
  assert.equal(refundAdmin.subject, 'Refund Confirmed – ORD-20261113-0001');
  assert.ok(refundAdmin.html.includes('GTBank reversal REF-5544'));

  // Verify default admin inbox and all 12 admin events exist in DEFAULT_EMAIL_PREFERENCES & labels
  assert.equal(DEFAULT_EMAIL_PREFERENCES.adminNotificationEmail, 'reddox528@gmail.com');
  assert.equal(DEFAULT_EMAIL_PREFERENCES.events.newCustomerAdmin, true);
  assert.equal(DEFAULT_EMAIL_PREFERENCES.events.orderProcessingAdmin, true);
  assert.equal(DEFAULT_EMAIL_PREFERENCES.events.readyForDispatchAdmin, true);
  assert.equal(DEFAULT_EMAIL_PREFERENCES.events.outForDeliveryAdmin, true);
  assert.equal(DEFAULT_EMAIL_PREFERENCES.events.deliveredAdmin, true);
  assert.equal(DEFAULT_EMAIL_PREFERENCES.events.refundConfirmedAdmin, true);
  assert.equal(EMAIL_TYPE_LABELS.new_customer, 'New Customer Registered');

  const receivedCust = buildCustomerOrderReceivedEmail({ ...ctx, orderStatusLabel: 'Received' });
  assert.equal(receivedCust.subject, 'Your Order Has Been Received – ORD-20261113-0001');
  assert.ok(receivedCust.html.includes('Awaiting Payment'));

  const paySub = buildCustomerPaymentSubmittedEmail(ctx);
  assert.equal(paySub.subject, 'Payment Submission Received – ORD-20261113-0001');
  assert.ok(paySub.html.includes('TRF-998877'));

  const payVer = buildCustomerPaymentVerifiedEmail(ctx);
  assert.equal(payVer.subject, 'Payment Confirmed – ORD-20261113-0001');

  const payRej = buildCustomerPaymentRejectedEmail(ctx);
  assert.equal(payRej.subject, 'Action Required: Payment Submission Rejected – ORD-20261113-0001');
  assert.ok(payRej.html.includes('Blurred receipt upload'));

  const refundCust = buildCustomerRefundConfirmedEmail(ctx);
  assert.equal(refundCust.subject, 'Refund Confirmed – ORD-20261113-0001');
  assert.ok(refundCust.html.includes('GTBank reversal REF-5544'));
});

test('Firestore & Storage security rules enforce order IDs, independent statuses, email outbox, and admin verification', () => {
  const firestoreRules = fs.readFileSync(path.resolve('firestore.rules'), 'utf8');
  const storageRules = fs.readFileSync(path.resolve('storage.rules'), 'utf8');

  // Verify email_verified requirement and admin boundary
  assert.match(firestoreRules, /request\.auth\.token\.email_verified == true/);
  assert.match(
    firestoreRules,
    /match \/admins\/\{uid\}[\s\S]*allow list: if isAdmin\(\);[\s\S]*allow create, update: if isValidId\(uid\) && isAdmin\(\)/
  );

  // Verify order creation enforces ORD-YYYYMMDD-XXXX, initial pending/awaiting_payment, and sequential counters
  assert.match(firestoreRules, /incoming\(\)\.orderNumber\.matches\('\^ORD-\[0-9\]\{8\}-\[0-9\]\{4,\}\$'\)/);
  assert.match(firestoreRules, /incoming\(\)\.orderStatus == 'pending'/);
  assert.match(firestoreRules, /incoming\(\)\.paymentStatus == 'awaiting_payment'/);
  assert.match(firestoreRules, /match \/orderCounters\/\{dateKey\}[\s\S]*incoming\(\)\.lastSequence == existing\(\)\.lastSequence \+ 1/);
  assert.match(firestoreRules, /match \/orderStatusHistory\/\{historyId\}[\s\S]*allow update, delete: if false;/);

  // Verify emailNotifications & emailPreferences isolation
  assert.match(firestoreRules, /match \/emailNotifications\/\{notificationId\}[\s\S]*allow get: if isValidId\(notificationId\) && isAdmin\(\);/);
  assert.match(firestoreRules, /incoming\(\)\.status == 'queued'/);
  assert.match(firestoreRules, /settingId in \['private', 'emailPreferences'\] && isAdmin\(\)/);

  // Verify customers cannot modify products/inventory
  assert.match(
    firestoreRules,
    /match \/products\/\{productId\}[\s\S]*allow create: if isValidId\(productId\)[\s\S]*&& isAdmin\(\)/
  );
  assert.match(
    firestoreRules,
    /match \/inventoryLogs\/\{logId\}[\s\S]*allow get: if isValidId\(logId\) && isAdmin\(\);[\s\S]*allow update, delete: if false;/
  );

  // Verify storage rules enforce size/type caps on receipt uploads and admin-only on storefront media
  assert.match(storageRules, /match \/receipts\/\{customerId\}\/\{orderId\}\/\{fileName\}/);
  assert.match(storageRules, /request\.resource\.size <= 5 \* 1024 \* 1024/);
  assert.match(storageRules, /match \/storefront\/\{folder\}\/\{fileName\}/);
});

test('Brevo transactional email client targets official endpoint with api-key header and records messageId without prematurely marking delivered', async () => {
  const payload = buildBrevoPayload({
    senderEmail: 'orders@koramarket.ng',
    senderName: 'KoraMarket Nigeria',
    toEmail: 'customer@example.com',
    replyToEmail: 'support@koramarket.ng',
    subject: 'Your Order Has Been Placed – ORD-20261113-0001',
    htmlContent: '<p>Order confirmed</p>',
    headers: { 'X-Order-Number': 'ORD-20261113-0001' },
  });

  assert.deepEqual(payload.sender, { name: 'KoraMarket Nigeria', email: 'orders@koramarket.ng' });
  assert.deepEqual(payload.to, [{ email: 'customer@example.com' }]);
  assert.deepEqual(payload.replyTo, { email: 'support@koramarket.ng' });
  assert.equal(payload.htmlContent, '<p>Order confirmed</p>');

  let capturedUrl = '';
  let capturedHeaders: Record<string, string> = {};
  let capturedBody: any = null;

  const successResult = await sendBrevoTransactionalEmail({
    apiKey: 'xkeysib-test-secret-not-real',
    senderEmail: 'orders@koramarket.ng',
    senderName: 'KoraMarket Nigeria',
    toEmail: 'customer@example.com',
    replyToEmail: 'support@koramarket.ng',
    subject: 'Your Order Has Been Placed – ORD-20261113-0001',
    htmlContent: '<p>Order confirmed</p>',
    fetchImpl: async (url, init) => {
      capturedUrl = url;
      capturedHeaders = init.headers;
      capturedBody = JSON.parse(init.body);
      return {
        ok: true,
        status: 201,
        json: async () => ({ messageId: '<202611130001.abc@smtp-relay.mailin.fr>' }),
      };
    },
  });

  assert.equal(capturedUrl, BREVO_API_ENDPOINT);
  assert.equal(capturedUrl, 'https://api.brevo.com/v3/smtp/email');
  assert.equal(capturedHeaders['api-key'], 'xkeysib-test-secret-not-real');
  assert.equal(capturedHeaders['content-type'], 'application/json');
  assert.equal(capturedBody.sender.email, 'orders@koramarket.ng');
  assert.equal(successResult.ok, true);
  assert.equal(successResult.status, 'sent');
  assert.equal(successResult.messageId, '<202611130001.abc@smtp-relay.mailin.fr>');
  // Critical invariant: API acceptance is NOT final inbox delivery
  assert.equal(successResult.deliveryStatus, 'accepted_by_provider');
  assert.notEqual(successResult.deliveryStatus, 'delivered');

  // Missing API key fails cleanly without throwing
  const missingKeyResult = await sendBrevoTransactionalEmail({
    apiKey: '',
    senderEmail: 'orders@koramarket.ng',
    toEmail: 'customer@example.com',
    subject: 'Test',
    htmlContent: '<p>Test</p>',
  });
  assert.equal(missingKeyResult.ok, false);
  assert.equal(missingKeyResult.status, 'failed');
  assert.match(missingKeyResult.failureReason, /BREVO_API_KEY/);

  // API HTTP error handling
  const errorResult = await sendBrevoTransactionalEmail({
    apiKey: 'xkeysib-invalid',
    senderEmail: 'orders@koramarket.ng',
    toEmail: 'customer@example.com',
    subject: 'Test',
    htmlContent: '<p>Test</p>',
    fetchImpl: async () => ({
      ok: false,
      status: 401,
      json: async () => ({ code: 'unauthorized', message: 'Key not found' }),
    }),
  });
  assert.equal(errorResult.ok, false);
  assert.equal(errorResult.status, 'failed');
  assert.equal(errorResult.deliveryStatus, 'failed');
  assert.equal(errorResult.failureReason, 'Key not found');

  // Brevo webhook mapping transitions
  assert.equal(mapBrevoWebhookEventToDeliveryStatus('delivered'), 'delivered');
  assert.equal(mapBrevoWebhookEventToDeliveryStatus('hard_bounce'), 'bounced');
  assert.equal(mapBrevoWebhookEventToDeliveryStatus('soft_bounce'), 'bounced');
  assert.equal(mapBrevoWebhookEventToDeliveryStatus('deferred'), 'accepted_by_provider');
});

test('Codebase has completely removed Resend provider references and never exposes BREVO_API_KEY in frontend', () => {
  const filesToAudit = [
    'server.ts',
    '.env.example',
    'README.md',
    'security_spec.md',
    'functions/src/index.ts',
    'functions/src/brevoClient.ts',
    'src/services/storefrontService.ts',
    'src/pages/admin/AdminOperationsPages.tsx',
  ];

  for (const relPath of filesToAudit) {
    const content = fs.readFileSync(path.resolve(relPath), 'utf8');
    assert.doesNotMatch(
      content,
      /api\.resend\.com|RESEND_API_KEY|RESEND_FROM_EMAIL|resendWebhook/i,
      `Legacy Resend reference found in ${relPath}`
    );
  }

  // Ensure frontend src/ never reads VITE_BREVO_* or BREVO_API_KEY
  const adminPage = fs.readFileSync(path.resolve('src/pages/admin/AdminOperationsPages.tsx'), 'utf8');
  const storefrontSvc = fs.readFileSync(path.resolve('src/services/storefrontService.ts'), 'utf8');
  assert.doesNotMatch(adminPage, /import\.meta\.env\.VITE_.*BREVO/i);
  assert.doesNotMatch(storefrontSvc, /import\.meta\.env\.VITE_.*BREVO/i);
  assert.doesNotMatch(storefrontSvc, /process\.env\.BREVO_API_KEY/i);
});

test('Image URL resolver maps legacy dev paths, hashed Vite paths, and Drive URLs to valid public image paths', () => {
  // Verify all catalog image files exist in public/images so both dev and production builds serve them
  for (const imgPath of Object.values(CATALOG_IMAGES)) {
    assert.ok(imgPath.startsWith('/images/'));
    assert.ok(fs.existsSync(path.resolve(`public${imgPath}`)), `Missing public asset: public${imgPath}`);
  }

  // Legacy dev-seeded path stored in Firestore -> stable public path
  assert.equal(
    resolveImageUrl('/src/assets/images/hero_modern_commerce_1794563144049.jpg'),
    '/images/hero_modern_commerce_1794563144049.jpg'
  );
  // Production Vite build-hashed asset path -> stable public path
  assert.equal(
    resolveImageUrl('/assets/product_audio_electronics_1794563143753-Bc9X2a1f.jpg'),
    '/images/product_audio_electronics_1794563143753.jpg'
  );
  // Google Drive share link conversion
  assert.equal(
    resolveImageUrl('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view?usp=sharing'),
    'https://lh3.googleusercontent.com/d/1AbCdEfGhIjKlMnOp'
  );
  // Fallback when empty
  assert.equal(resolveImageUrl('', CATALOG_IMAGES.heroModernCommerce), CATALOG_IMAGES.heroModernCommerce);
});

test('Firebase Auth error formatter and password reset validators map error codes and enforce password rules', () => {
  assert.equal(validateEmailFormat('customer@example.com'), true);
  assert.equal(validateEmailFormat('  user.name+tag@domain.ng  '), true);
  assert.equal(validateEmailFormat('invalid-email'), false);
  assert.equal(validateEmailFormat('missing@domain'), false);

  assert.equal(validateResetPasswordForm('', ''), 'Please enter a new password.');
  assert.equal(
    validateResetPasswordForm('12345', '12345'),
    'Password must be at least 6 characters long.'
  );
  assert.equal(
    validateResetPasswordForm('SecurePass1!', 'DifferentPass1!'),
    'Passwords do not match. Please re-enter both fields.'
  );
  assert.equal(validateResetPasswordForm('SecurePass1!', 'SecurePass1!'), null);

  assert.match(formatAuthError({ code: 'auth/invalid-credential' }), /Incorrect email or password/i);
  assert.match(formatAuthError({ code: 'auth/expired-action-code' }), /expired/i);
  assert.match(formatAuthError({ code: 'auth/invalid-action-code' }), /invalid or has already been used/i);
  assert.match(formatAuthError({ code: 'auth/too-many-requests' }), /wait a few minutes/i);
  assert.match(formatAuthError({ code: 'auth/unauthorized-domain' }), /Authorized domains/i);
  assert.match(formatAuthError({ code: 'auth/operation-not-allowed' }), /Sign-in method/i);
});

test('Firebase configuration targets reddox211 (160789406869) cleanly with singleton initialization and zero Default Gemini Project references', () => {
  const appletConfig = JSON.parse(fs.readFileSync(path.resolve('firebase-applet-config.json'), 'utf8'));
  const firebaserc = JSON.parse(fs.readFileSync(path.resolve('.firebaserc'), 'utf8'));
  const firebaseTs = fs.readFileSync(path.resolve('src/firebase.ts'), 'utf8');
  const authContextTsx = fs.readFileSync(path.resolve('src/context/AuthContext.tsx'), 'utf8');
  const authPagesTsx = fs.readFileSync(path.resolve('src/pages/store/AuthPages.tsx'), 'utf8');
  const appTsx = fs.readFileSync(path.resolve('src/App.tsx'), 'utf8');

  assert.equal(appletConfig.projectId, 'reddox211');
  assert.equal(appletConfig.messagingSenderId, '160789406869');
  assert.equal(appletConfig.authDomain, 'reddox211.firebaseapp.com');
  assert.equal(appletConfig.storageBucket, 'reddox211.firebasestorage.app');
  assert.equal(firebaserc.projects.default, 'reddox211');

  assert.match(firebaseTs, /getApps\(\)\.length > 0 \? getApp\(\) : initializeApp\(firebaseConfig\)/);
  assert.match(authContextTsx, /browserLocalPersistence/);
  assert.match(authContextTsx, /verifyPasswordResetCode/);
  assert.match(authContextTsx, /confirmPasswordReset/);
  assert.match(authPagesTsx, /Forgot Your Password\?/);
  assert.match(authPagesTsx, /Send Reset Link/);
  assert.match(authPagesTsx, /Update Password/);
  assert.match(appTsx, /path="\/reset-password"/);
  assert.match(appTsx, /path="\/auth\/action"/);

  const filesToCheck = [
    'firebase-applet-config.json',
    '.firebaserc',
    'firebase.json',
    'server.ts',
    'src/firebase.ts',
    'src/context/AuthContext.tsx',
    'src/pages/store/AuthPages.tsx',
    'functions/src/index.ts',
    'README.md',
  ];
  for (const rel of filesToCheck) {
    const content = fs.readFileSync(path.resolve(rel), 'utf8');
    assert.doesNotMatch(content, /gen-lang-client-0329974020/i, `Unexpected old project ID in ${rel}`);
  }
});


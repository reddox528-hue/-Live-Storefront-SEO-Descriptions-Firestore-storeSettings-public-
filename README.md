# KoraMarket Nigeria — Full-Stack Nigerian E-Commerce Storefront & Admin Dashboard

A production-ready, full-stack Nigerian general e-commerce application built with **React 19**, **TypeScript**, **Tailwind CSS v4**, **Express**, **Firebase Authentication**, **Cloud Firestore**, **Firebase Storage**, and **Firebase Cloud Functions**.

All pricing operates strictly in **Nigerian Naira (`₦` / `NGN`)** stored as integer **kobo** (`priceKobo`, `totalKobo`, etc.), timestamps render in **West Africa Time (`WAT`, `Africa/Lagos`)**, and payments are processed exclusively via **Direct Bank Transfer** with receipt/reference verification controlled solely by authorized administrators.

---

## Core Features

### Customer Storefront
- **Editorial Nigerian Commerce UI**: Announcement bar, sticky navigation, category showcase, featured products, best sellers, new arrivals, and full-bleed promotional banners managed from Admin Settings.
- **Catalog & Product Discovery**: Search, category filtering, Naira price range sliders, in-stock & discounted filters, sorting, variant selection, specifications table, related products, and verified customer reviews.
- **Shopping Cart & Checkout**: Persistent cart drawer/page, Nigerian state + LGA validation against active Delivery Zones (unsupported states block checkout cleanly), promotional code application, optional VAT calculation, and server/client kobo totals.
- **Bank Transfer Payment Workflow**: Displays configured Nigerian bank details and order reference; customers upload bank transfer receipts (`JPG`, `PNG`, `WEBP`, or `PDF` up to 5MB) and transfer references. Orders stay `awaiting_payment` / `pending_verification` until an administrator verifies funds.
- **Customer Account**: Google Sign-In & Email/Password auth with verification & password reset, saved Nigerian delivery addresses, real-time order tracking timeline, notifications, and review submission.

### Protected Admin Dashboard (`/admin`)
- **KPI Overview**: Revenue analytics (kobo/NGN), order counts, pending bank transfer alerts, and low-stock warnings.
- **Product, Category & Discount Management**: Create/edit/archive products, upload product images to Firebase Storage, configure variants & specifications, manage hierarchical categories, and schedule automatic or promo-code discounts.
- **Bank Payment Verification Queue & 7-Stage Order Lifecycle**: Inspect customer-uploaded bank receipts, **MARK AS RECEIVED** (`Pending → Received` with timestamp, admin attribution, live customer update, and acknowledgement emails), **Verify & Mark Paid** (atomically deducts inventory without forcing order status changes), **Record Refund**, or **Reject Payment**, and progress orders independently (`Pending` → `Received` → `Processing` → `Ready for Dispatch` → `Out for Delivery` → `Delivered` or `Cancelled`).
- **Unique Order IDs (`ORD-YYYYMMDD-XXXX`)**: Atomic transaction counters in `/orderCounters/{dateKey}` guarantee collision-free order numbers with zero PII.
- **Automated Email Notifications (Brevo)**: Server-side transactional HTML emails via Brevo (`POST https://api.brevo.com/v3/smtp/email`) powered by Firebase Cloud Functions + Secret Manager (`BREVO_API_KEY`), idempotent `/emailNotifications` outbox tracking, scheduled retries, admin test email tool, and delivery webhook listener (`brevoWebhook`).
- **Delivery Zones**: Configure supported Nigerian states, optional LGA matching, delivery fees (`₦`), free-delivery thresholds, and estimated delivery windows.
- **Inventory, Customers, Reviews & Settings**: Manual stock adjustments with audit history, customer order summaries, review moderation, and full editing of store name, logo, bank transfer account, admin notification email preferences, homepage hero/banners, policies, FAQ, and SEO metadata.

---

## Project Architecture

- **Frontend**: `src/` (`React`, `react-router-dom`, `Tailwind CSS v4`, live `onSnapshot` listeners)
- **Backend Proxy & SSR SEO Server**: `server.ts` (Express serving Vite in dev / `dist` in production, `/api/health`, `/robots.txt`, dynamic `/sitemap.xml`, `/api/email/*`, and `/api/admin/*` endpoints)
- **Cloud Functions**: `functions/src/index.ts` (`setAdminClaim`, `calculateCheckoutTotals`, `createOrder`, `markOrderReceived`, `submitPayment`, `verifyPayment`, `rejectPayment`, `recordRefundConfirmed`, `updateOrderStatus`, `adminGetDashboardStats`, `adminAdjustInventory`, `onNewCustomerCreated`, `processEmailOutboxOnCreate`, `processEmailOutboxOnRequeue`, `retryFailedEmailsSchedule`, `sendTestEmail`, `retryFailedEmail`, `brevoWebhook`)
- **Security**: `firestore.rules`, `storage.rules`, `firestore.indexes.json`, `firebase-blueprint.json`, `security_spec.md`

---

## Setup & Deployment Guide

### 1. Local Development
```bash
npm install
npm run dev
```
The Express + Vite server runs on `http://localhost:3000`.

### 2. Run Tests & Security Audits
```bash
# Type check & lint TypeScript
npm run lint

# Audit Firestore security rules with @firebase/eslint-plugin-security-rules
npx eslint firestore.rules

# Run unit & security rule invariant tests
npx tsx --test firestore.rules.test.ts

# Production build check
npm run build
```

### 3. Automated Email Notifications Setup (Brevo + Firebase Secret Manager)
Email API keys are never exposed in frontend code or `VITE_*` variables. Configure Brevo strictly server-side:

1. **Verify your sender email / domain in Brevo** (e.g., `orders@yourdomain.com`) and generate a Brevo transactional API key (`xkeysib-...`) under **SMTP & API → API Keys**.
2. **Store `BREVO_API_KEY` in Firebase Secret Manager**:
   ```bash
   firebase login
   firebase use reddox211
   firebase functions:secrets:set BREVO_API_KEY
   ```
   Configure server environment variables in `functions/.env` (non-secret configuration):
   - `BREVO_FROM_EMAIL="orders@yourdomain.com"`
   - `BREVO_FROM_NAME="KoraMarket Nigeria"`
   - `ADMIN_NOTIFICATION_EMAIL="reddox528@gmail.com"`
   - `APP_URL="https://your-live-domain.com"`
3. **Deploy Cloud Functions**:
   ```bash
   cd functions && npm install && npm run build && cd ..
   firebase deploy --only functions
   ```
   - Set `VITE_USE_CLOUD_FUNCTIONS="true"` once Cloud Functions are deployed so order creation, status updates, and transactional email dispatch run directly via Cloud Functions.
   - *(Optional)* Configure a Brevo Transactional Webhook pointing to your deployed `brevoWebhook` HTTP endpoint (`delivered`, `hard_bounce`, `soft_bounce`, `blocked`, `spam`) to track true inbox delivery after Brevo API acceptance.
   - *(Optional for Express-hosted previews)*: Set `BREVO_API_KEY`, `BREVO_FROM_EMAIL`, `BREVO_FROM_NAME`, `ADMIN_NOTIFICATION_EMAIL`, and `APP_URL` in server runtime environment secrets if dispatching via `server.ts` `/api/email/*`.
4. **Configure Preferences & Test**:
   - In Admin Dashboard → **Settings** → **Automated Email Notifications (Brevo)**, set your **Admin Notification Email**, verified sender email, reply-to, and per-event toggles, then click **Send Test Email**.
   - Inspect **Admin → Email Outbox & Alerts** (`/admin/notifications`) to audit `Sent` / `Queued` / `Failed` statuses, Brevo `messageId` records, webhook delivery states (`accepted_by_provider` vs `delivered`), HTML previews, or manually retry failed emails.

### 4. Firebase Console Configuration (Project: `reddox211`)
`firestore.rules` has been deployed to Firestore database `ai-studio-0aa6a804-3df3-4c29-9094-ee6edaaf8941`. Complete the remaining steps in the [Firebase Console](https://console.firebase.google.com/project/reddox211):

1. **Enable Email/Password Authentication**:
   - Go to **Authentication → Sign-in method** → enable **Email/Password** (Google Sign-In is enabled automatically).
2. **Enable Firebase Storage**:
   - Go to **Storage → Get Started** to activate the default bucket (`reddox211.firebasestorage.app`).
3. **Deploy Storage Rules & Indexes**:
   ```bash
   firebase deploy --only storage,firestore:indexes
   ```

### 5. First Admin Setup & Sample Catalog Seed
1. Sign in at `/login` using the primary administrator account (`reddox528@gmail.com`) via Google Sign-In (or verified Email/Password).
2. Navigate to `/admin` (or click the **Admin Dashboard** link).
3. Click **Seed Nigerian Sample Catalog** in the Admin sidebar or Dashboard banner if the store is empty to populate initial categories, products, delivery zones (Lagos, Abuja FCT, Rivers, Oyo), discounts, and store settings (including default `emailPreferences`).
4. Go to `/admin/settings` to enter your live business bank account details and admin notification email before accepting customer orders.

### 6. Optional Express Admin API Auth (`server.ts`)
If deploying `server.ts` outside Cloud Run/GCP Application Default Credentials, set `FIREBASE_SERVICE_ACCOUNT_KEY` in environment secrets so server-side `/api/admin/*` and `/api/email/*` routes can initialize `firebase-admin`.

---

## Security & Privacy Notes
- Customers cannot modify product prices, stock levels, discount rules, delivery fees, `orderStatus`, or `paymentStatus` (`orderStatus` starts at `pending` and `paymentStatus` starts at `awaiting_payment`).
- Bank transfer receipt uploads are restricted to `image/jpeg`, `image/png`, `image/webp`, and `application/pdf` under 5MB inside `/receipts/{customerId}/{orderId}/`.
- Admin privileges require a verified email (`email_verified == true`) plus bootstrap owner email or an authorized record in `/admins/{uid}`.
- Automated email outbox logs (`/emailNotifications`) and `/storeSettings/emailPreferences` are readable exclusively by administrators.
- Review `firestore.rules` and `storage.rules` before launching to production.

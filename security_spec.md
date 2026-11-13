# Security Specification & Payload-First TDD (`security_spec.md`)

## 1. Data Invariants

1. **Identity & Privilege Isolation**: No user may create a profile with `role: 'admin'`, escalate their own `role` to `'admin'`, or write to `/admins/{uid}` unless already verified as an administrator (`isAdmin()`).
2. **Order Integrity & Atomic Order IDs**: A customer may only create an `/orders/{orderId}` document for their own `request.auth.uid`, with a server/transaction-generated `orderNumber` matching `^ORD-[0-9]{8}-[0-9]{4,}$` (never using email or PII), `orderStatus: 'pending'`, `paymentStatus: 'awaiting_payment'`, `deliveryStatus: 'pending'`, `currency: 'NGN'`, `paymentMethod: 'bank_transfer'`, `stockDeducted: false`, and `totalKobo == subtotalKobo - discountTotalKobo + deliveryFeeKobo` (`totalKobo > 0`). `/orderCounters/{dateKey}` increments strictly sequentially (`+1`) inside a transaction and cannot be deleted.
3. **Independent Order Status vs Payment Status & Acknowledgement**: `orderStatus` (`pending`, `received`, `processing`, `ready_for_dispatch`, `out_for_delivery`, `delivered`, `cancelled`) and `paymentStatus` (`awaiting_payment`, `payment_submitted`, `under_verification`, `paid`, `payment_rejected`, `refunded`) are maintained independently. Only `isAdmin()` may transition `orderStatus` (including **MARK AS RECEIVED**: `pending -> received`) or set `receivedAt`, `receivedBy`, `cancelledAt`, or `refundedAt`. Immutable transition records in `/orderStatusHistory/{historyId}` cannot be updated or deleted.
4. **Payment Verification Authority**: A customer may only submit `/payments/{paymentId}` for an order they own (`get(.../orders/{orderId}).data.customerId == request.auth.uid`) and strictly with `status: 'payment_submitted'`. Only `isAdmin()` may transition a payment or order to `'paid'`, `'payment_rejected'`, or `'refunded'`. Bank transfers are never auto-marked `'paid'`.
5. **Catalog & Pricing Protection**: Only `isAdmin()` may create, update, or delete `/products`, `/categories`, `/discounts`, `/deliveryZones`, `/inventoryLogs`, and `/storeSettings`. Customers can never alter `priceKobo`, `stockQuantity`, or `deliveryFeeKobo`.
6. **PII, Email Outbox & Private Configuration Isolation**: `/users/{uid}`, `/orders/{orderId}`, `/payments/{paymentId}`, `/addresses/{addressId}`, `/carts/{customerId}`, `/orderStatusHistory/{historyId}`, and `/notifications/{notificationId}` enforce strict `isOwner` or `isAdmin()` access on both `get` and `list`. `/storeSettings/private`, `/storeSettings/emailPreferences`, and reads of `/emailNotifications/{notificationId}` are strictly `isAdmin()` only. Customers can only enqueue `status: 'queued'` (`attemptCount == 0`, no `providerMessageId` or `sentAt`) email outbox documents for their own order; server-side Brevo API dispatch runs exclusively via Cloud Functions Secret Manager (`BREVO_API_KEY`) or server-side Admin SDK routes.
7. **Verified Purchase Reviews**: A customer may only create a `/reviews/{reviewId}` document referencing a paid order they own (`paymentStatus == 'paid'`), with `isApproved: false`. Only `isAdmin()` may approve reviews (`isApproved: true`).
8. **Temporal & ID Integrity**: All document IDs match `^[a-zA-Z0-9_-]+$` (`<= 128` chars), and all `createdAt`/`updatedAt` timestamps equal `request.time`.

## 2. The "Dirty Dozen" Attack Payloads (All Must Return PERMISSION_DENIED)

1. **Privilege Escalation on Registration**: Customer sends `POST /users/{uid}` with `{ role: "admin", accountStatus: "active" }`.
2. **Self-Role Mutation**: Customer updates `/users/{uid}` with `{ role: "admin" }`.
3. **Shadow Ghost Field Injection**: Customer creates `/users/{uid}` with `{ ..., isVerifiedAdmin: true }`.
4. **Spoofed Unverified Email Admin**: User with `email: "reddox528@gmail.com"` and `email_verified: false` attempts admin write to `/products/{id}`.
5. **Order Paid Bypass**: Customer creates `/orders/{id}` with `{ paymentStatus: "paid", deliveryStatus: "delivered" }`.
6. **Negative / Manipulated Order Total**: Customer creates `/orders/{id}` with `{ subtotalKobo: 50000, discountTotalKobo: 0, deliveryFeeKobo: 0, totalKobo: 100 }`.
7. **Cross-Tenant Order Read**: Customer A executes `get` or `list` on `/orders` without filtering `customerId == customerA.uid`, or reads Customer B's order.
8. **Customer Self-Approving Payment**: Customer creates `/payments/{id}` with `{ status: "paid" }` or updates `/payments/{id}` to `{ status: "paid" }`.
9. **Payment Hijack on Another User's Order**: Customer A submits `/payments/{id}` referencing Customer B's `orderId`.
10. **Customer Tampering with Product Price or Stock**: Customer updates `/products/{id}` with `{ priceKobo: 1, stockQuantity: 999 }`.
11. **Unapproved Review Auto-Publish**: Customer creates `/reviews/{id}` with `{ isApproved: true }` or for an unpaid order.
12. **Resource Exhaustion / ID Poisoning**: Attacker creates `/addresses/{1500_char_id}` or injects a 50KB string into `fullName` or `recipientId` outside size limits.

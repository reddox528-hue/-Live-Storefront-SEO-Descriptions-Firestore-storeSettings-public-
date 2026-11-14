export interface EmailTemplateContext {
  storeName: string;
  logoUrl?: string;
  contactEmail?: string;
  phoneNumber?: string;
  businessAddress?: string;
  primaryColor?: string;
  appUrl: string;
  orderNumber: string;
  orderId: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  items: Array<{
    productName: string;
    quantity: number;
    finalUnitPriceKobo: number;
    lineTotalKobo: number;
  }>;
  subtotalKobo: number;
  discountTotalKobo: number;
  deliveryFeeKobo: number;
  totalKobo: number;
  orderStatusLabel: string;
  paymentStatusLabel: string;
  deliveryStatusLabel?: string;
  deliveryAddressText?: string;
  bankDetails?: {
    bankName?: string;
    accountName?: string;
    accountNumber?: string;
    transferInstructions?: string;
  };
  transferReference?: string;
  transferDate?: string;
  rejectionReason?: string;
  cancellationReason?: string;
  refundNotes?: string;
  trackingNotes?: string;
  deliveryPersonnel?: string;
  timestampWat?: string;
}

function formatNairaHtml(kobo: number): string {
  const naira = (Number.isFinite(kobo) ? kobo : 0) / 100;
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(naira);
}

function esc(val: string | undefined | null): string {
  return String(val || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wrapLayout(
  ctx: Pick<
    EmailTemplateContext,
    'storeName' | 'logoUrl' | 'contactEmail' | 'phoneNumber' | 'businessAddress' | 'primaryColor'
  >,
  heading: string,
  badgeText: string,
  bodyHtml: string
): string {
  const accent = ctx.primaryColor || '#065F46';
  const logoBlock = ctx.logoUrl
    ? `<img src="${esc(ctx.logoUrl)}" alt="${esc(ctx.storeName)}" style="max-height:36px;margin-bottom:8px;" />`
    : `<div style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.02em;">${esc(ctx.storeName)}</div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>${esc(heading)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#18181b;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f4f4f5;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
          <tr>
            <td style="background-color:${esc(accent)};padding:24px 28px;">
              ${logoBlock}
              <div style="margin-top:8px;display:inline-block;padding:4px 10px;border-radius:4px;background:rgba(255,255,255,0.16);color:#ffffff;font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;">
                ${esc(badgeText)}
              </div>
              <h1 style="margin:12px 0 0 0;color:#ffffff;font-size:22px;line-height:1.3;font-weight:700;">
                ${esc(heading)}
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;font-size:14px;line-height:1.6;color:#27272a;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="background-color:#fafafa;padding:20px 28px;border-top:1px solid #e4e4e7;font-size:12px;color:#71717a;line-height:1.6;">
              <strong style="color:#18181b;">${esc(ctx.storeName)}</strong><br/>
              ${ctx.businessAddress ? `${esc(ctx.businessAddress)}<br/>` : ''}
              ${ctx.contactEmail ? `Email: ${esc(ctx.contactEmail)}` : ''}${ctx.phoneNumber ? ` · Tel: ${esc(ctx.phoneNumber)}` : ''}
              <div style="margin-top:8px;font-size:11px;color:#a1a1aa;">
                Automated transactional notification · Prices stated in Nigerian Naira (₦).
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function renderOrderItemsTable(ctx: EmailTemplateContext): string {
  const rows = ctx.items
    .map(
      (it) => `<tr>
        <td style="padding:8px 0;border-bottom:1px solid #f4f4f5;">${esc(it.productName)}</td>
        <td align="center" style="padding:8px 8px;border-bottom:1px solid #f4f4f5;font-family:monospace;">${it.quantity}</td>
        <td align="right" style="padding:8px 0;border-bottom:1px solid #f4f4f5;font-family:monospace;">${formatNairaHtml(it.lineTotalKobo)}</td>
      </tr>`
    )
    .join('');

  return `<table width="100%" cellspacing="0" cellpadding="0" style="margin:16px 0;border-collapse:collapse;font-size:13px;">
    <thead>
      <tr style="border-bottom:2px solid #e4e4e7;color:#71717a;text-transform:uppercase;font-size:11px;">
        <th align="left" style="padding-bottom:6px;">Item</th>
        <th align="center" style="padding-bottom:6px;">Qty</th>
        <th align="right" style="padding-bottom:6px;">Amount</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr>
        <td colspan="2" align="right" style="padding:10px 8px 4px 0;color:#52525b;">Subtotal</td>
        <td align="right" style="padding:10px 0 4px 0;font-family:monospace;">${formatNairaHtml(ctx.subtotalKobo)}</td>
      </tr>
      ${
        ctx.discountTotalKobo > 0
          ? `<tr>
        <td colspan="2" align="right" style="padding:4px 8px;color:#065F46;">Discounts</td>
        <td align="right" style="padding:4px 0;font-family:monospace;color:#065F46;">-${formatNairaHtml(ctx.discountTotalKobo)}</td>
      </tr>`
          : ''
      }
      <tr>
        <td colspan="2" align="right" style="padding:4px 8px;color:#52525b;">Delivery Fee</td>
        <td align="right" style="padding:4px 0;font-family:monospace;">${ctx.deliveryFeeKobo === 0 ? 'Free' : formatNairaHtml(ctx.deliveryFeeKobo)}</td>
      </tr>
      <tr>
        <td colspan="2" align="right" style="padding:8px 8px 0 0;font-weight:700;font-size:15px;border-top:1px solid #e4e4e7;">Total Payable (NGN)</td>
        <td align="right" style="padding:8px 0 0 0;font-weight:700;font-size:15px;font-family:monospace;border-top:1px solid #e4e4e7;color:#065F46;">${formatNairaHtml(ctx.totalKobo)}</td>
      </tr>
    </tfoot>
  </table>`;
}

function ctaButton(url: string, label: string, accent = '#065F46'): string {
  return `<div style="margin:22px 0;">
    <a href="${esc(url)}" style="display:inline-block;background-color:${esc(accent)};color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 22px;border-radius:8px;">
      ${esc(label)}
    </a>
  </div>`;
}

export function buildCustomerOrderPlacedEmail(ctx: EmailTemplateContext): { subject: string; html: string } {
  const customerUrl = `${ctx.appUrl.replace(/\/$/, '')}/account/orders/${ctx.orderId}`;
  const bankBlock = ctx.bankDetails?.accountNumber
    ? `<div style="background:#f4f4f5;border:1px solid #e4e4e7;border-radius:8px;padding:16px;margin:16px 0;">
        <div style="font-weight:700;margin-bottom:8px;color:#18181b;">Bank Transfer Instructions</div>
        <div><strong>Bank:</strong> ${esc(ctx.bankDetails.bankName)}</div>
        <div><strong>Account Name:</strong> ${esc(ctx.bankDetails.accountName)}</div>
        <div><strong>Account Number:</strong> <span style="font-family:monospace;font-size:15px;font-weight:700;">${esc(ctx.bankDetails.accountNumber)}</span></div>
        <div><strong>Exact Amount:</strong> <span style="font-family:monospace;font-weight:700;color:#065F46;">${formatNairaHtml(ctx.totalKobo)}</span></div>
        <div><strong>Narration / Reference:</strong> <span style="font-family:monospace;font-weight:700;">${esc(ctx.orderNumber)}</span></div>
        ${ctx.bankDetails.transferInstructions ? `<p style="margin:8px 0 0 0;font-size:12px;color:#52525b;">${esc(ctx.bankDetails.transferInstructions)}</p>` : ''}
      </div>`
    : '';

  const html = wrapLayout(
    ctx,
    `Order ${ctx.orderNumber} Placed`,
    'Order Confirmation',
    `<p>Hello ${esc(ctx.customerName)},</p>
     <p>Thank you for shopping with <strong>${esc(ctx.storeName)}</strong>. Your order <strong>${esc(ctx.orderNumber)}</strong> has been submitted and is currently <strong>${esc(ctx.orderStatusLabel)}</strong> administrator acknowledgement.</p>
     <p style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px;font-size:13px;color:#92400e;">
       <strong>Payment Method:</strong> Nigerian Bank Transfer<br/>
       <strong>Order Status:</strong> ${esc(ctx.orderStatusLabel)}<br/>
       <strong>Payment Status:</strong> ${esc(ctx.paymentStatusLabel)} (Bank transfers are never auto-marked paid—please transfer the exact total and upload your receipt.)
     </p>
     ${renderOrderItemsTable(ctx)}
     ${bankBlock}
     ${ctaButton(customerUrl, 'View Order & Upload Transfer Receipt', ctx.primaryColor)}`
  );

  return { subject: `Your Order Has Been Placed – ${ctx.orderNumber}`, html };
}

export function buildAdminNewOrderEmail(ctx: EmailTemplateContext): { subject: string; html: string } {
  const adminUrl = `${ctx.appUrl.replace(/\/$/, '')}/admin/orders/${ctx.orderId}`;
  const html = wrapLayout(
    ctx,
    `New Order: ${ctx.orderNumber}`,
    'Admin Action Required',
    `<p>Hello Store Administrator,</p>
     <p>A new order has been placed on <strong>${esc(ctx.storeName)}</strong> and is awaiting your acknowledgement (<strong>MARK AS RECEIVED</strong>).</p>
     <table width="100%" cellspacing="0" cellpadding="4" style="font-size:13px;background:#fafafa;border:1px solid #e4e4e7;border-radius:8px;padding:12px;margin:12px 0;">
       <tr><td><strong>Order ID:</strong></td><td style="font-family:monospace;font-weight:700;">${esc(ctx.orderNumber)}</td></tr>
       <tr><td><strong>Customer Name:</strong></td><td>${esc(ctx.customerName)}</td></tr>
       <tr><td><strong>Customer Email:</strong></td><td>${esc(ctx.customerEmail)}</td></tr>
       <tr><td><strong>Customer Phone:</strong></td><td>${esc(ctx.customerPhone || 'Not provided')}</td></tr>
       <tr><td><strong>Payment Method:</strong></td><td>Nigerian Bank Transfer</td></tr>
       <tr><td><strong>Payment Status:</strong></td><td>${esc(ctx.paymentStatusLabel)}</td></tr>
       <tr><td><strong>Order Total (NGN):</strong></td><td style="font-family:monospace;font-weight:700;color:#065F46;">${formatNairaHtml(ctx.totalKobo)}</td></tr>
       <tr><td><strong>Delivery Address:</strong></td><td>${esc(ctx.deliveryAddressText || '—')}</td></tr>
       <tr><td><strong>Order Date (WAT):</strong></td><td>${esc(ctx.timestampWat || '—')}</td></tr>
     </table>
     ${renderOrderItemsTable(ctx)}
     ${ctaButton(adminUrl, 'View Order in Admin Dashboard', '#0f172a')}`
  );
  return { subject: `New Order Received – ${ctx.orderNumber}`, html };
}

export function buildCustomerOrderReceivedEmail(ctx: EmailTemplateContext): { subject: string; html: string } {
  const customerUrl = `${ctx.appUrl.replace(/\/$/, '')}/account/orders/${ctx.orderId}`;
  const html = wrapLayout(
    ctx,
    `Order ${ctx.orderNumber} Received`,
    'Order Acknowledged',
    `<p>Hello ${esc(ctx.customerName)},</p>
     <p>Good news! Our team has received and acknowledged your order <strong>${esc(ctx.orderNumber)}</strong>.</p>
     <div style="background:#fafafa;border:1px solid #e4e4e7;border-radius:8px;padding:14px;margin:14px 0;font-size:13px;">
       <div><strong>Current Order Status:</strong> ${esc(ctx.orderStatusLabel)}</div>
       <div><strong>Payment Status:</strong> ${esc(ctx.paymentStatusLabel)}</div>
     </div>
     <p><strong>Next steps:</strong> ${
       ctx.paymentStatusLabel.toLowerCase().includes('paid')
         ? 'Your payment has been confirmed and our team will prepare your items for dispatch.'
         : 'If you have not already done so, please complete your bank transfer and upload your receipt on your order tracking page so we can verify your payment and begin processing.'
     }</p>
     ${ctaButton(customerUrl, 'Track Your Order', ctx.primaryColor)}`
  );
  return { subject: `Your Order Has Been Received – ${ctx.orderNumber}`, html };
}

export function buildAdminOrderReceivedEmail(ctx: EmailTemplateContext): { subject: string; html: string } {
  const adminUrl = `${ctx.appUrl.replace(/\/$/, '')}/admin/orders/${ctx.orderId}`;
  const html = wrapLayout(
    ctx,
    `Order Acknowledged: ${ctx.orderNumber}`,
    'Admin Log',
    `<p>Order <strong>${esc(ctx.orderNumber)}</strong> for ${esc(ctx.customerName)} was marked as <strong>Received</strong>.</p>
     <p><strong>Order Status:</strong> ${esc(ctx.orderStatusLabel)}<br/><strong>Payment Status:</strong> ${esc(ctx.paymentStatusLabel)}<br/><strong>Time (WAT):</strong> ${esc(ctx.timestampWat || '')}</p>
     ${ctaButton(adminUrl, 'Inspect Order', '#0f172a')}`
  );
  return { subject: `Order Acknowledged (Received) – ${ctx.orderNumber}`, html };
}

export function buildCustomerPaymentSubmittedEmail(ctx: EmailTemplateContext): { subject: string; html: string } {
  const customerUrl = `${ctx.appUrl.replace(/\/$/, '')}/account/orders/${ctx.orderId}`;
  const html = wrapLayout(
    ctx,
    `Payment Evidence Submitted – ${ctx.orderNumber}`,
    'Verification Pending',
    `<p>Hello ${esc(ctx.customerName)},</p>
     <p>We have received your bank transfer submission for order <strong>${esc(ctx.orderNumber)}</strong>.</p>
     <div style="background:#fafafa;border:1px solid #e4e4e7;border-radius:8px;padding:14px;margin:14px 0;font-size:13px;">
       <div><strong>Amount Claimed:</strong> <span style="font-family:monospace;">${formatNairaHtml(ctx.totalKobo)}</span></div>
       <div><strong>Transfer Reference:</strong> <span style="font-family:monospace;">${esc(ctx.transferReference)}</span></div>
       <div><strong>Transfer Date:</strong> ${esc(ctx.transferDate)}</div>
       <div><strong>Payment Status:</strong> Payment Submitted (Awaiting Administrator Verification)</div>
     </div>
     <p>Our finance desk will verify that the funds have cleared into our bank account. You will receive an email immediately after verification.</p>
     ${ctaButton(customerUrl, 'View Payment Status', ctx.primaryColor)}`
  );
  return { subject: `Payment Submission Received – ${ctx.orderNumber}`, html };
}

export function buildAdminPaymentSubmittedEmail(ctx: EmailTemplateContext): { subject: string; html: string } {
  const adminUrl = `${ctx.appUrl.replace(/\/$/, '')}/admin/orders/${ctx.orderId}`;
  const html = wrapLayout(
    ctx,
    `Verify Payment for ${ctx.orderNumber}`,
    'Payment Verification Required',
    `<p>Hello Store Administrator,</p>
     <p>Customer <strong>${esc(ctx.customerName)}</strong> has submitted bank transfer payment proof for order <strong>${esc(ctx.orderNumber)}</strong>.</p>
     <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px;margin:14px 0;font-size:13px;">
       <div><strong>Order ID:</strong> <span style="font-family:monospace;">${esc(ctx.orderNumber)}</span></div>
       <div><strong>Customer Name:</strong> ${esc(ctx.customerName)}</div>
       <div><strong>Amount Submitted:</strong> <span style="font-family:monospace;font-weight:700;">${formatNairaHtml(ctx.totalKobo)}</span></div>
       <div><strong>Payment Reference:</strong> <span style="font-family:monospace;">${esc(ctx.transferReference || 'Not provided')}</span></div>
       <div><strong>Transfer Date:</strong> ${esc(ctx.transferDate || '—')}</div>
       <div><strong>Submitted At (WAT):</strong> ${esc(ctx.timestampWat || '—')}</div>
     </div>
     <p>Confirm cleared funds in your bank statement before clicking <strong>Confirm Bank Transfer Paid</strong>.</p>
     ${ctaButton(adminUrl, 'Review Payment in Admin Dashboard', '#0f172a')}`
  );
  return { subject: `Payment Verification Required – ${ctx.orderNumber}`, html };
}

export function buildCustomerPaymentVerifiedEmail(ctx: EmailTemplateContext): { subject: string; html: string } {
  const customerUrl = `${ctx.appUrl.replace(/\/$/, '')}/account/orders/${ctx.orderId}`;
  const html = wrapLayout(
    ctx,
    `Payment Confirmed – ${ctx.orderNumber}`,
    'Paid (Verified)',
    `<p>Hello ${esc(ctx.customerName)},</p>
     <p>Your Nigerian bank transfer of <strong>${formatNairaHtml(ctx.totalKobo)}</strong> for order <strong>${esc(ctx.orderNumber)}</strong> has been verified and confirmed.</p>
     <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;padding:14px;margin:14px 0;font-size:13px;color:#065F46;">
       <div><strong>Payment Status:</strong> Paid (Verified)</div>
       <div><strong>Order Status:</strong> ${esc(ctx.orderStatusLabel)}</div>
     </div>
     <p>Our fulfillment team will now prepare and package your items for dispatch.</p>
     ${ctaButton(customerUrl, 'Track Order Progress', ctx.primaryColor)}`
  );
  return { subject: `Payment Confirmed – ${ctx.orderNumber}`, html };
}

export function buildAdminPaymentVerifiedEmail(ctx: EmailTemplateContext): { subject: string; html: string } {
  const adminUrl = `${ctx.appUrl.replace(/\/$/, '')}/admin/orders/${ctx.orderId}`;
  const html = wrapLayout(
    ctx,
    `Payment Verified: ${ctx.orderNumber}`,
    'Admin Log',
    `<p>Payment of <strong>${formatNairaHtml(ctx.totalKobo)}</strong> for order <strong>${esc(ctx.orderNumber)}</strong> (${esc(ctx.customerName)}) was verified and marked <strong>Paid</strong>.</p>
     ${ctaButton(adminUrl, 'Manage Fulfillment', '#0f172a')}`
  );
  return { subject: `Payment Verified – ${ctx.orderNumber}`, html };
}

export function buildCustomerPaymentRejectedEmail(ctx: EmailTemplateContext): { subject: string; html: string } {
  const customerUrl = `${ctx.appUrl.replace(/\/$/, '')}/account/orders/${ctx.orderId}`;
  const html = wrapLayout(
    ctx,
    `Payment Rejected – ${ctx.orderNumber}`,
    'Action Required',
    `<p>Hello ${esc(ctx.customerName)},</p>
     <p>Your recent bank transfer submission for order <strong>${esc(ctx.orderNumber)}</strong> could not be confirmed and was marked <strong>Payment Rejected</strong>.</p>
     <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:14px;margin:14px 0;font-size:13px;color:#991b1b;">
       <strong>Reason:</strong> ${esc(ctx.rejectionReason || 'Transfer could not be matched in our bank statement.')}
     </div>
     <p>Please review your transfer receipt and re-submit valid payment proof using the button below, or reply with your bank session ID at ${esc(ctx.contactEmail)}.</p>
     ${ctaButton(customerUrl, 'Resubmit Payment Proof', '#b91c1c')}`
  );
  return { subject: `Action Required: Payment Submission Rejected – ${ctx.orderNumber}`, html };
}

export function buildAdminPaymentRejectedEmail(ctx: EmailTemplateContext): { subject: string; html: string } {
  const adminUrl = `${ctx.appUrl.replace(/\/$/, '')}/admin/orders/${ctx.orderId}`;
  const html = wrapLayout(
    ctx,
    `Payment Rejected: ${ctx.orderNumber}`,
    'Admin Log',
    `<p>Payment submission for order <strong>${esc(ctx.orderNumber)}</strong> was rejected.</p>
     <p><strong>Reason recorded:</strong> ${esc(ctx.rejectionReason || '—')}</p>
     ${ctaButton(adminUrl, 'View Order', '#0f172a')}`
  );
  return { subject: `Payment Rejection Recorded – ${ctx.orderNumber}`, html };
}

export function buildCustomerStatusStageEmail(
  ctx: EmailTemplateContext,
  stage: 'order_processing' | 'ready_for_dispatch' | 'out_for_delivery' | 'order_delivered'
): { subject: string; html: string } {
  const customerUrl = `${ctx.appUrl.replace(/\/$/, '')}/account/orders/${ctx.orderId}`;
  const titles: Record<typeof stage, { subject: string; badge: string; body: string }> = {
    order_processing: {
      subject: `Your Order Is Now Processing – ${ctx.orderNumber}`,
      badge: 'Processing',
      body: `Our fulfillment team has started preparing and quality-checking the items in your order <strong>${esc(ctx.orderNumber)}</strong>.`,
    },
    ready_for_dispatch: {
      subject: `Your Order Is Ready for Dispatch – ${ctx.orderNumber}`,
      badge: 'Ready for Dispatch',
      body: `Your order <strong>${esc(ctx.orderNumber)}</strong> is packed, sealed, and awaiting handover to our dispatch rider.`,
    },
    out_for_delivery: {
      subject: `Your Order Is Out for Delivery – ${ctx.orderNumber}`,
      badge: 'Out for Delivery',
      body: `Your order <strong>${esc(ctx.orderNumber)}</strong> has left our hub and is on its way to <strong>${esc(ctx.deliveryAddressText || 'your delivery address')}</strong>.`,
    },
    order_delivered: {
      subject: `Your Order Has Been Delivered – ${ctx.orderNumber}`,
      badge: 'Delivered',
      body: `Your order <strong>${esc(ctx.orderNumber)}</strong> has been marked <strong>Delivered</strong>. Thank you for shopping with ${esc(ctx.storeName)}! We would love your feedback—visit the product page from your order summary to leave a verified review.`,
    },
  };

  const info = titles[stage];
  const extraDelivery =
    ctx.deliveryPersonnel || ctx.trackingNotes
      ? `<div style="background:#fafafa;border:1px solid #e4e4e7;border-radius:8px;padding:14px;margin:14px 0;font-size:13px;">
          ${ctx.deliveryPersonnel ? `<div><strong>Dispatch Rider / Courier:</strong> ${esc(ctx.deliveryPersonnel)}</div>` : ''}
          ${ctx.trackingNotes ? `<div><strong>Tracking Notes:</strong> ${esc(ctx.trackingNotes)}</div>` : ''}
         </div>`
      : '';

  const html = wrapLayout(
    ctx,
    info.subject.replace(` – ${ctx.orderNumber}`, ''),
    info.badge,
    `<p>Hello ${esc(ctx.customerName)},</p>
     <p>${info.body}</p>
     ${extraDelivery}
     ${ctaButton(customerUrl, stage === 'order_delivered' ? 'View Order & Leave a Review' : 'Track Delivery', ctx.primaryColor)}`
  );

  return { subject: info.subject, html };
}

export function buildOrderCancelledEmail(
  ctx: EmailTemplateContext,
  recipientType: 'customer' | 'admin'
): { subject: string; html: string } {
  const linkUrl =
    recipientType === 'admin'
      ? `${ctx.appUrl.replace(/\/$/, '')}/admin/orders/${ctx.orderId}`
      : `${ctx.appUrl.replace(/\/$/, '')}/account/orders/${ctx.orderId}`;

  const html = wrapLayout(
    ctx,
    `Order ${ctx.orderNumber} Cancelled`,
    'Order Cancelled',
    `<p>${recipientType === 'customer' ? `Hello ${esc(ctx.customerName)},` : 'Administrator Notice:'}</p>
     <p>Order <strong>${esc(ctx.orderNumber)}</strong> has been cancelled.</p>
     <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:14px;margin:14px 0;font-size:13px;color:#991b1b;">
       <div><strong>Cancellation Reason:</strong> ${esc(ctx.cancellationReason || 'Cancelled by administrator')}</div>
       <div><strong>Payment Status:</strong> ${esc(ctx.paymentStatusLabel)}</div>
     </div>
     ${
       recipientType === 'customer'
         ? `<p>If you had already completed a verified bank transfer payment for this order, our accounts team will process your refund back to your Nigerian bank account and send you a refund confirmation email once completed.</p>`
         : ''
     }
     ${ctaButton(linkUrl, 'View Order Record', '#18181b')}`
  );
  return { subject: `Order Cancelled – ${ctx.orderNumber}`, html };
}

export function buildCustomerRefundConfirmedEmail(ctx: EmailTemplateContext): { subject: string; html: string } {
  const customerUrl = `${ctx.appUrl.replace(/\/$/, '')}/account/orders/${ctx.orderId}`;
  const html = wrapLayout(
    ctx,
    `Refund Confirmed – ${ctx.orderNumber}`,
    'Refund Completed',
    `<p>Hello ${esc(ctx.customerName)},</p>
     <p>Your bank transfer refund of <strong>${formatNairaHtml(ctx.totalKobo)}</strong> for order <strong>${esc(ctx.orderNumber)}</strong> has been completed and confirmed by our finance team.</p>
     ${
       ctx.refundNotes
         ? `<div style="background:#fafafa;border:1px solid #e4e4e7;border-radius:8px;padding:14px;margin:14px 0;font-size:13px;">
              <strong>Refund Reference / Notes:</strong> ${esc(ctx.refundNotes)}
            </div>`
         : ''
     }
     ${ctaButton(customerUrl, 'View Order Details', ctx.primaryColor)}`
  );
  return { subject: `Refund Confirmed – ${ctx.orderNumber}`, html };
}

export function buildAdminStatusStageEmail(
  ctx: EmailTemplateContext,
  stage: 'order_processing' | 'ready_for_dispatch' | 'out_for_delivery' | 'order_delivered'
): { subject: string; html: string } {
  const adminUrl = `${ctx.appUrl.replace(/\/$/, '')}/admin/orders/${ctx.orderId}`;
  const stageMeta: Record<typeof stage, { subject: string; badge: string; label: string }> = {
    order_processing: {
      subject: `Order Processing Started – ${ctx.orderNumber}`,
      badge: 'Processing',
      label: 'Processing',
    },
    ready_for_dispatch: {
      subject: `Order Ready for Dispatch – ${ctx.orderNumber}`,
      badge: 'Ready for Dispatch',
      label: 'Ready for Dispatch',
    },
    out_for_delivery: {
      subject: `Order Out for Delivery – ${ctx.orderNumber}`,
      badge: 'Out for Delivery',
      label: 'Out for Delivery',
    },
    order_delivered: {
      subject: `Order Delivered – ${ctx.orderNumber}`,
      badge: 'Delivered',
      label: 'Delivered',
    },
  };
  const info = stageMeta[stage];
  const html = wrapLayout(
    ctx,
    `${info.label}: ${ctx.orderNumber}`,
    `Admin Log · ${info.badge}`,
    `<p>Hello Store Administrator,</p>
     <p>Order <strong>${esc(ctx.orderNumber)}</strong> for <strong>${esc(ctx.customerName)}</strong> has transitioned to <strong>${esc(info.label)}</strong>.</p>
     <div style="background:#fafafa;border:1px solid #e4e4e7;border-radius:8px;padding:14px;margin:14px 0;font-size:13px;">
       <div><strong>Order ID:</strong> <span style="font-family:monospace;">${esc(ctx.orderNumber)}</span></div>
       <div><strong>Customer:</strong> ${esc(ctx.customerName)} (${esc(ctx.customerEmail)})</div>
       <div><strong>Order Total (NGN):</strong> <span style="font-family:monospace;font-weight:700;">${formatNairaHtml(ctx.totalKobo)}</span></div>
       <div><strong>Payment Status:</strong> ${esc(ctx.paymentStatusLabel)}</div>
       ${ctx.deliveryPersonnel ? `<div><strong>Dispatch Rider / Courier:</strong> ${esc(ctx.deliveryPersonnel)}</div>` : ''}
       ${ctx.trackingNotes ? `<div><strong>Tracking Notes:</strong> ${esc(ctx.trackingNotes)}</div>` : ''}
       <div><strong>Updated At (WAT):</strong> ${esc(ctx.timestampWat || '—')}</div>
     </div>
     ${ctaButton(adminUrl, 'View Order in Admin Dashboard', '#0f172a')}`
  );
  return { subject: info.subject, html };
}

export function buildAdminRefundConfirmedEmail(ctx: EmailTemplateContext): { subject: string; html: string } {
  const adminUrl = `${ctx.appUrl.replace(/\/$/, '')}/admin/orders/${ctx.orderId}`;
  const html = wrapLayout(
    ctx,
    `Refund Confirmed: ${ctx.orderNumber}`,
    'Admin Log · Refund Completed',
    `<p>Hello Store Administrator,</p>
     <p>A refund of <strong>${formatNairaHtml(ctx.totalKobo)}</strong> has been confirmed for order <strong>${esc(ctx.orderNumber)}</strong> (${esc(ctx.customerName)}).</p>
     <div style="background:#fafafa;border:1px solid #e4e4e7;border-radius:8px;padding:14px;margin:14px 0;font-size:13px;">
       <div><strong>Order ID:</strong> <span style="font-family:monospace;">${esc(ctx.orderNumber)}</span></div>
       <div><strong>Customer:</strong> ${esc(ctx.customerName)} (${esc(ctx.customerEmail)})</div>
       <div><strong>Refund Amount (NGN):</strong> <span style="font-family:monospace;font-weight:700;">${formatNairaHtml(ctx.totalKobo)}</span></div>
       ${ctx.refundNotes ? `<div><strong>Refund Reference / Notes:</strong> ${esc(ctx.refundNotes)}</div>` : ''}
       <div><strong>Confirmed At (WAT):</strong> ${esc(ctx.timestampWat || '—')}</div>
     </div>
     ${ctaButton(adminUrl, 'View Order in Admin Dashboard', '#0f172a')}`
  );
  return { subject: `Refund Confirmed – ${ctx.orderNumber}`, html };
}

export function buildAdminNewCustomerEmail(ctx: {
  storeName: string;
  logoUrl?: string;
  contactEmail?: string;
  phoneNumber?: string;
  businessAddress?: string;
  primaryColor?: string;
  appUrl: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  timestampWat?: string;
}): { subject: string; html: string } {
  const customersUrl = `${ctx.appUrl.replace(/\/$/, '')}/admin/customers`;
  const html = wrapLayout(
    ctx,
    `New Customer Account: ${ctx.customerName}`,
    'New Customer Registered',
    `<p>Hello Store Administrator,</p>
     <p>A new verified customer account has been created on <strong>${esc(ctx.storeName)}</strong>.</p>
     <div style="background:#fafafa;border:1px solid #e4e4e7;border-radius:8px;padding:14px;margin:14px 0;font-size:13px;">
       <div><strong>Customer Name:</strong> ${esc(ctx.customerName)}</div>
       <div><strong>Email Address:</strong> ${esc(ctx.customerEmail)}</div>
       <div><strong>Phone Number:</strong> ${esc(ctx.customerPhone || 'Not provided')}</div>
       <div><strong>Customer ID:</strong> <span style="font-family:monospace;">${esc(ctx.customerId)}</span></div>
       <div><strong>Registered At (WAT):</strong> ${esc(ctx.timestampWat || '—')}</div>
     </div>
     ${ctaButton(customersUrl, 'View Customers in Admin Dashboard', '#0f172a')}`
  );
  return { subject: `New Customer Registered – ${ctx.customerName}`, html };
}


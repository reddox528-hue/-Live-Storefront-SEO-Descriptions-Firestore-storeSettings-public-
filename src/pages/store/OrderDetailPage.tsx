import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  CheckCircle2,
  Landmark,
  UploadCloud,
  Truck,
  ArrowLeft,
  Clock,
  AlertCircle,
  Copy,
  Check,
  PackageCheck,
  Ban,
  Bell,
} from 'lucide-react';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { StoreLayout } from '../../components/StoreLayout';
import { SEOHead } from '../../components/SEOHead';
import { useAuth } from '../../context/AuthContext';
import { useStore } from '../../context/StoreContext';
import { db } from '../../firebase';
import {
  Order,
  OrderStatus,
  OrderStatusHistoryEntry,
  PaymentSubmission,
  StoreBankSettings,
} from '../../types/ecommerce';
import {
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  deriveOrderStatus,
  formatLagosDateTime,
  formatNaira,
} from '../../utils/nigerianCurrency';
import {
  fetchBankSettings,
  submitPaymentEvidence,
} from '../../services/storefrontService';
import { uploadFileToStorage, validateUploadFile } from '../../services/storageService';

const ORDER_STEPS: Array<{ key: OrderStatus; label: string }> = [
  { key: 'pending', label: 'Pending' },
  { key: 'received', label: 'Received' },
  { key: 'processing', label: 'Processing' },
  { key: 'ready_for_dispatch', label: 'Ready for Dispatch' },
  { key: 'out_for_delivery', label: 'Out for Delivery' },
  { key: 'delivered', label: 'Delivered' },
];

function orderStatusBadgeClass(status: string): string {
  switch (status) {
    case 'pending':
      return 'bg-amber-50 text-amber-800 border-amber-200';
    case 'received':
      return 'bg-emerald-50 text-[#065F46] border-emerald-200';
    case 'processing':
    case 'ready_for_dispatch':
      return 'bg-sky-50 text-sky-800 border-sky-200';
    case 'out_for_delivery':
      return 'bg-indigo-50 text-indigo-800 border-indigo-200';
    case 'delivered':
      return 'bg-[#065F46] text-white border-[#065F46]';
    case 'cancelled':
      return 'bg-red-50 text-red-800 border-red-200';
    default:
      return 'bg-zinc-100 text-zinc-700 border-zinc-200';
  }
}

function paymentStatusBadgeClass(status: string): string {
  switch (status) {
    case 'paid':
      return 'bg-emerald-50 text-[#065F46] border-emerald-200';
    case 'payment_submitted':
    case 'under_verification':
      return 'bg-sky-50 text-sky-800 border-sky-200';
    case 'payment_rejected':
      return 'bg-red-50 text-red-800 border-red-200';
    case 'refunded':
      return 'bg-purple-50 text-purple-800 border-purple-200';
    default:
      return 'bg-amber-50 text-amber-800 border-amber-200';
  }
}

export function OrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const [searchParams] = useSearchParams();
  const justCreated = searchParams.get('created') === '1';

  const { firebaseUser, authReady } = useAuth();
  const { publicSettings, notifications, showToast } = useStore();

  const [order, setOrder] = useState<Order | null>(null);
  const [payments, setPayments] = useState<PaymentSubmission[]>([]);
  const [historyEntries, setHistoryEntries] = useState<OrderStatusHistoryEntry[]>([]);
  const [bankSettings, setBankSettings] = useState<StoreBankSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedOrderNum, setCopiedOrderNum] = useState(false);

  const [transferReference, setTransferReference] = useState('');
  const [transferDate, setTransferDate] = useState(() => new Date().toISOString().slice(0, 16));
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!authReady) return;
    if (!firebaseUser || !firebaseUser.emailVerified || !orderId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    fetchBankSettings()
      .then(setBankSettings)
      .catch(() => {});

    const unsubOrder = onSnapshot(
      doc(db, 'orders', orderId),
      (snap) => {
        setOrder(snap.exists() ? (snap.data() as Order) : null);
        setLoading(false);
      },
      (err) => {
        setErrorMsg(err?.message || 'Unable to load order.');
        setLoading(false);
      }
    );

    const unsubPayments = onSnapshot(
      query(
        collection(db, 'payments'),
        where('customerId', '==', firebaseUser.uid),
        where('orderId', '==', orderId)
      ),
      (snap) => {
        setPayments(
          snap.docs
            .map((d) => d.data() as PaymentSubmission)
            .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
        );
      },
      () => {}
    );

    const unsubHistory = onSnapshot(
      query(
        collection(db, 'orderStatusHistory'),
        where('customerId', '==', firebaseUser.uid),
        where('orderId', '==', orderId)
      ),
      (snap) => {
        setHistoryEntries(
          snap.docs
            .map((d) => d.data() as OrderStatusHistoryEntry)
            .sort((a, b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0))
        );
      },
      () => {}
    );

    return () => {
      unsubOrder();
      unsubPayments();
      unsubHistory();
    };
  }, [authReady, firebaseUser, orderId]);

  const combinedHistory = useMemo(() => {
    const map = new Map<string, OrderStatusHistoryEntry>();
    for (const h of order?.statusHistory || []) {
      const k = h.historyId || `${h.statusField}_${h.newStatus}_${h.timestamp?.seconds || 0}`;
      map.set(k, h);
    }
    for (const h of historyEntries) {
      const k = h.historyId || `${h.statusField}_${h.newStatus}_${h.timestamp?.seconds || 0}`;
      map.set(k, h);
    }
    return Array.from(map.values()).sort(
      (a, b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0)
    );
  }, [order?.statusHistory, historyEntries]);

  const orderNotifications = useMemo(
    () => notifications.filter((n) => n.relatedOrderId === orderId),
    [notifications, orderId]
  );

  const handleCopyOrderNumber = async () => {
    if (!order?.orderNumber) return;
    try {
      await navigator.clipboard.writeText(order.orderNumber);
      setCopiedOrderNum(true);
      setTimeout(() => setCopiedOrderNum(false), 2000);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const validationErr = validateUploadFile(file, true);
    if (validationErr) {
      setErrorMsg(validationErr);
      return;
    }
    setErrorMsg('');
    setReceiptFile(file);
    if (file.type.startsWith('image/')) {
      setReceiptPreview(URL.createObjectURL(file));
    } else {
      setReceiptPreview(null);
    }
  };

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order || !firebaseUser) return;
    setErrorMsg('');

    if (!transferReference.trim() || !transferDate.trim()) {
      setErrorMsg('Please enter your bank transfer reference and transfer date.');
      return;
    }

    setSubmittingPayment(true);
    try {
      let receiptImageUrl = '';
      if (receiptFile) {
        receiptImageUrl = await uploadFileToStorage(
          receiptFile,
          `receipts/${firebaseUser.uid}/${order.orderId}`,
          {
            allowPdf: true,
            onProgress: (pct) => setUploadProgress(pct),
          }
        );
      }

      await submitPaymentEvidence({
        orderId: order.orderId,
        customerId: firebaseUser.uid,
        amountKobo: order.totalKobo,
        orderNumber: order.orderNumber,
        transferReference,
        transferDate,
        receiptImageUrl,
      });

      setTransferReference('');
      setReceiptFile(null);
      setReceiptPreview(null);
      setUploadProgress(null);
      showToast('Payment receipt submitted! Awaiting administrator verification.');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not submit payment evidence.');
    } finally {
      setSubmittingPayment(false);
    }
  };

  if (loading) {
    return (
      <StoreLayout>
        <div className="max-w-4xl mx-auto px-4 py-16 text-sm text-zinc-500">
          Loading order details...
        </div>
      </StoreLayout>
    );
  }

  if (!order) {
    return (
      <StoreLayout>
        <div className="max-w-lg mx-auto px-4 py-16 text-center space-y-4">
          <h1 className="font-display text-2xl font-bold text-zinc-900">Order Not Found</h1>
          <p className="text-sm text-zinc-600">
            This order could not be loaded or belongs to another account.
          </p>
          <Link
            to="/account/orders"
            className="inline-block px-5 py-2.5 rounded-xl bg-zinc-900 text-white text-sm font-medium"
          >
            Back to My Orders
          </Link>
        </div>
      </StoreLayout>
    );
  }

  const currentOrderStatus = deriveOrderStatus(order) as OrderStatus;
  const activeStepIndex = ORDER_STEPS.findIndex((s) => s.key === currentOrderStatus);
  const canSubmitPayment =
    (order.paymentStatus === 'awaiting_payment' || order.paymentStatus === 'payment_rejected') &&
    currentOrderStatus !== 'cancelled';

  const getStepTimestamp = (stepKey: OrderStatus) => {
    if (stepKey === 'pending') return order.createdAt;
    if (stepKey === 'received' && order.receivedAt) return order.receivedAt;
    if (stepKey === 'delivered' && order.deliveredAt) return order.deliveredAt;
    const match = combinedHistory.find(
      (h) => h.statusField === 'orderStatus' && h.newStatus === stepKey
    );
    return match?.timestamp;
  };

  return (
    <StoreLayout>
      <SEOHead
        title={`Order ${order.orderNumber} – ${publicSettings.storeName}`}
        description="Track live order progress, status updates, and Nigerian bank transfer verification."
      />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-8">
        <Link
          to="/account/orders"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-600 hover:text-zinc-900"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to My Orders</span>
        </Link>

        {/* Order Confirmation Callout */}
        {justCreated && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 flex items-start gap-4">
            <CheckCircle2 className="w-6 h-6 text-[#065F46] shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h2 className="font-display text-lg font-bold text-zinc-900">
                Order {order.orderNumber} Placed Successfully
              </h2>
              <p className="text-sm text-zinc-700 leading-relaxed">
                Your unique order reference is{' '}
                <strong className="font-mono">{order.orderNumber}</strong>. Complete your Nigerian
                Naira bank transfer below and upload your receipt for administrator verification.
                Order acknowledgement and delivery updates appear live on this page.
              </p>
            </div>
          </div>
        )}

        {/* Cancelled Callout */}
        {currentOrderStatus === 'cancelled' && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-5 flex items-start gap-3">
            <Ban className="w-5 h-5 text-red-700 shrink-0 mt-0.5" />
            <div className="space-y-1 text-sm text-red-900">
              <p className="font-bold">This order has been cancelled</p>
              {order.cancellationReason && (
                <p className="text-xs text-red-800">Reason: {order.cancellationReason}</p>
              )}
              {order.cancelledAt && (
                <p className="text-xs text-red-700">
                  Cancelled on {formatLagosDateTime(order.cancelledAt)} (WAT)
                </p>
              )}
            </div>
          </div>
        )}

        {/* Header Summary with Separated Order Status & Payment Status */}
        <div className="bg-white border border-zinc-200/80 rounded-2xl p-6 sm:p-8 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-1.5">
              <p className="text-xs uppercase tracking-wider text-zinc-500 font-medium">
                Unique Order Number
              </p>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="font-mono text-2xl sm:text-3xl font-bold text-zinc-900">
                  {order.orderNumber}
                </h1>
                <button
                  type="button"
                  onClick={handleCopyOrderNumber}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-zinc-200 text-xs font-medium text-zinc-600 hover:bg-zinc-50 cursor-pointer"
                >
                  {copiedOrderNum ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-[#065F46]" />
                      <span className="text-[#065F46]">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
              <p className="text-xs text-zinc-500">
                Placed on {formatLagosDateTime(order.createdAt)} (WAT)
              </p>
            </div>

            <div className="text-left md:text-right">
              <p className="text-xs text-zinc-500">Total Payable</p>
              <p className="font-mono text-2xl font-bold text-[#065F46] mt-0.5 tabular-nums">
                {formatNaira(order.totalKobo)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-zinc-100">
            <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200/70 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs text-zinc-500">Order Status</p>
                <p className="text-sm font-bold text-zinc-900 mt-0.5">
                  {ORDER_STATUS_LABELS[currentOrderStatus] || currentOrderStatus}
                </p>
                {order.receivedAt && (
                  <p className="text-[11px] text-[#065F46] mt-0.5">
                    Acknowledged {formatLagosDateTime(order.receivedAt)} (WAT)
                  </p>
                )}
              </div>
              <span
                className={`px-3 py-1 rounded-full text-xs font-semibold border ${orderStatusBadgeClass(
                  currentOrderStatus
                )}`}
              >
                {ORDER_STATUS_LABELS[currentOrderStatus] || currentOrderStatus}
              </span>
            </div>

            <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200/70 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs text-zinc-500">Payment Status (Independent)</p>
                <p className="text-sm font-bold text-zinc-900 mt-0.5">
                  {PAYMENT_STATUS_LABELS[order.paymentStatus] || order.paymentStatus}
                </p>
                {order.refundNotes && order.paymentStatus === 'refunded' && (
                  <p className="text-[11px] text-purple-700 mt-0.5">Ref: {order.refundNotes}</p>
                )}
              </div>
              <span
                className={`px-3 py-1 rounded-full text-xs font-semibold border ${paymentStatusBadgeClass(
                  order.paymentStatus
                )}`}
              >
                {PAYMENT_STATUS_LABELS[order.paymentStatus] || order.paymentStatus}
              </span>
            </div>
          </div>
        </div>

        {/* Visual 6-Step Order Progress Tracker */}
        {currentOrderStatus !== 'cancelled' && (
          <div className="bg-white border border-zinc-200/80 rounded-2xl p-6 space-y-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-lg font-bold text-zinc-900 flex items-center gap-2">
                <PackageCheck className="w-5 h-5 text-[#065F46]" />
                <span>Live Order Progress</span>
              </h2>
              <span className="text-xs text-zinc-500">Updates automatically in real time</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {ORDER_STEPS.map((step, index) => {
                const isCompleted = activeStepIndex >= index;
                const isCurrent = activeStepIndex === index;
                const stepTs = getStepTimestamp(step.key);
                return (
                  <div
                    key={step.key}
                    className={`p-3.5 rounded-xl border transition-colors ${
                      isCurrent
                        ? 'bg-emerald-50/90 border-[#065F46] ring-1 ring-[#065F46]/20'
                        : isCompleted
                          ? 'bg-zinc-50 border-zinc-300'
                          : 'bg-white border-zinc-200/70 opacity-60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-2">
                      <span
                        className={`w-6 h-6 rounded-full text-[11px] font-mono font-bold flex items-center justify-center ${
                          isCompleted
                            ? 'bg-[#065F46] text-white'
                            : 'bg-zinc-200 text-zinc-600'
                        }`}
                      >
                        {isCompleted ? '✓' : index + 1}
                      </span>
                      {isCurrent && (
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#065F46]">
                          Current
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-semibold text-zinc-900 leading-snug">
                      {step.label}
                    </p>
                    <p className="text-[11px] text-zinc-500 mt-1">
                      {stepTs ? formatLagosDateTime(stepTs) : isCompleted ? 'Recorded' : 'Upcoming'}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Bank Transfer Instructions & Receipt Upload */}
        {canSubmitPayment && bankSettings && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 bg-white border border-zinc-200/80 rounded-2xl p-6 space-y-4">
              <div className="flex items-center gap-2">
                <Landmark className="w-5 h-5 text-[#065F46]" />
                <h2 className="font-display text-lg font-bold text-zinc-900">
                  Bank Transfer Details
                </h2>
              </div>
              <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200 space-y-2.5 text-sm">
                <div>
                  <span className="text-xs text-zinc-500 block">Bank Name</span>
                  <strong className="text-zinc-900">{bankSettings.bankName}</strong>
                </div>
                <div>
                  <span className="text-xs text-zinc-500 block">Account Name</span>
                  <strong className="text-zinc-900">{bankSettings.accountName}</strong>
                </div>
                <div>
                  <span className="text-xs text-zinc-500 block">Account Number</span>
                  <strong className="font-mono text-lg text-zinc-900">
                    {bankSettings.accountNumber}
                  </strong>
                </div>
                <div>
                  <span className="text-xs text-zinc-500 block">Exact Amount to Transfer</span>
                  <strong className="font-mono text-lg text-[#065F46]">
                    {formatNaira(order.totalKobo)}
                  </strong>
                </div>
                <div>
                  <span className="text-xs text-zinc-500 block">Transfer Narration / Reference</span>
                  <strong className="font-mono text-zinc-900">{order.orderNumber}</strong>
                </div>
              </div>
              <p className="text-xs text-zinc-600 leading-relaxed">
                {bankSettings.transferInstructions}
              </p>
            </div>

            <form
              onSubmit={handlePaymentSubmit}
              className="lg:col-span-7 bg-white border border-zinc-200/80 rounded-2xl p-6 space-y-4"
            >
              <h2 className="font-display text-lg font-bold text-zinc-900">
                Submit Proof of Bank Transfer
              </h2>

              {order.paymentStatus === 'payment_rejected' && payments[0]?.verificationNotes && (
                <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <strong className="block">Previous submission rejected:</strong>
                    <span>{payments[0].verificationNotes}</span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-700 mb-1.5">
                    Transfer Reference / Session ID *
                  </label>
                  <input
                    type="text"
                    required
                    value={transferReference}
                    onChange={(e) => setTransferReference(e.target.value)}
                    placeholder="e.g. NIP-20261113-8842"
                    className="w-full px-3.5 py-2.5 text-sm border border-zinc-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-700 mb-1.5">
                    Transfer Date & Time *
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={transferDate}
                    onChange={(e) => setTransferDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm border border-zinc-300 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1.5">
                  Upload Transfer Receipt (JPEG, PNG, WEBP, or PDF · Max 5MB)
                </label>
                <label className="flex flex-col items-center justify-center p-5 border-2 border-dashed border-zinc-300 rounded-xl cursor-pointer hover:border-[#065F46] bg-zinc-50">
                  <UploadCloud className="w-6 h-6 text-zinc-500 mb-2" />
                  <span className="text-xs font-medium text-zinc-700">
                    {receiptFile ? receiptFile.name : 'Click to choose receipt file'}
                  </span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>
                {receiptPreview && (
                  <img
                    src={receiptPreview}
                    alt="Receipt preview"
                    className="mt-3 max-h-40 rounded-lg border border-zinc-200 object-contain"
                  />
                )}
                {uploadProgress !== null && (
                  <div className="mt-2 w-full bg-zinc-200 rounded-full h-1.5">
                    <div
                      className="bg-[#065F46] h-1.5 rounded-full transition-all"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                )}
              </div>

              {errorMsg && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
                  {errorMsg}
                </div>
              )}

              <button
                type="submit"
                disabled={submittingPayment}
                className="w-full py-3 rounded-xl bg-[#065F46] text-white text-sm font-semibold hover:bg-[#047857] cursor-pointer disabled:opacity-60"
              >
                {submittingPayment ? 'Submitting Proof...' : 'Submit Payment Confirmation'}
              </button>
            </form>
          </div>
        )}

        {/* Payment Submissions History */}
        {payments.length > 0 && (
          <div className="bg-white border border-zinc-200/80 rounded-2xl p-6 space-y-4">
            <h2 className="font-display text-lg font-bold text-zinc-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-zinc-500" />
              <span>Submitted Payment Records</span>
            </h2>
            <div className="divide-y divide-zinc-100 text-sm">
              {payments.map((p) => (
                <div key={p.paymentId} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <p className="font-mono font-medium text-zinc-900">Ref: {p.transferReference}</p>
                    <p className="text-xs text-zinc-500">
                      Transfer Date: {p.transferDate} · Amount: {formatNaira(p.amountKobo)}
                    </p>
                    {p.verificationNotes && (
                      <p className="text-xs text-zinc-700 mt-1">Notes: {p.verificationNotes}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {p.receiptImageUrl && (
                      <a
                        href={p.receiptImageUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-[#065F46] underline"
                      >
                        View Receipt
                      </a>
                    )}
                    <span className="text-xs font-semibold text-zinc-900">
                      {PAYMENT_STATUS_LABELS[p.status] || p.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Ordered Items & Delivery Address */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 bg-white border border-zinc-200/80 rounded-2xl p-6 space-y-4">
            <h2 className="font-display text-lg font-bold text-zinc-900">Items Ordered</h2>
            <div className="divide-y divide-zinc-100">
              {order.items.map((item, idx) => (
                <div key={idx} className="py-3.5 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    {item.image && (
                      <img
                        src={item.image}
                        alt={item.productName}
                        className="w-14 h-14 rounded-lg object-cover bg-zinc-100 shrink-0"
                      />
                    )}
                    <div className="min-w-0">
                      <Link
                        to={`/product/${item.slug}`}
                        className="font-medium text-sm text-zinc-900 hover:underline truncate block"
                      >
                        {item.productName}
                      </Link>
                      <p className="text-xs text-zinc-500">
                        Qty: {item.quantity} × {formatNaira(item.finalUnitPriceKobo)}
                      </p>
                    </div>
                  </div>
                  <span className="font-mono text-sm font-semibold tabular-nums">
                    {formatNaira(item.lineTotalKobo)}
                  </span>
                </div>
              ))}
            </div>

            <div className="border-t border-zinc-200 pt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-zinc-600">Subtotal</span>
                <span className="font-mono tabular-nums">{formatNaira(order.subtotalKobo)}</span>
              </div>
              {order.discountTotalKobo > 0 && (
                <div className="flex justify-between text-[#065F46]">
                  <span>Discount</span>
                  <span className="font-mono tabular-nums">
                    -{formatNaira(order.discountTotalKobo)}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-zinc-600">Delivery Fee</span>
                <span className="font-mono tabular-nums">
                  {order.deliveryFeeKobo === 0 ? 'Free' : formatNaira(order.deliveryFeeKobo)}
                </span>
              </div>
              <div className="flex justify-between font-bold text-zinc-900 pt-2 border-t border-zinc-100">
                <span>Total</span>
                <span className="font-mono tabular-nums">{formatNaira(order.totalKobo)}</span>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 bg-white border border-zinc-200/80 rounded-2xl p-6 space-y-4">
            <h2 className="font-display text-lg font-bold text-zinc-900 flex items-center gap-2">
              <Truck className="w-4 h-4 text-[#065F46]" />
              <span>Delivery & Dispatch</span>
            </h2>
            <div className="text-sm text-zinc-700 space-y-1">
              <p className="font-semibold text-zinc-900">{order.deliveryAddress.fullName}</p>
              <p>{order.deliveryAddress.streetAddress}</p>
              <p>
                {order.deliveryAddress.city}, {order.deliveryAddress.lga},{' '}
                {order.deliveryAddress.state}
              </p>
              <p className="font-mono text-xs text-zinc-500 pt-1">{order.deliveryAddress.phone}</p>
            </div>
            {order.deliveryInstructions && (
              <div className="p-3 rounded-lg bg-zinc-50 border border-zinc-200 text-xs text-zinc-600">
                <strong>Instructions:</strong> {order.deliveryInstructions}
              </div>
            )}
            {order.deliveryPersonnel && (
              <div className="p-3 rounded-lg bg-zinc-50 border border-zinc-200 text-xs text-zinc-700">
                <strong>Assigned Courier:</strong> {order.deliveryPersonnel}
              </div>
            )}
            {order.deliveryTrackingNotes && (
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-zinc-800">
                <strong className="block text-[#065F46]">Dispatch Update:</strong>
                <span>{order.deliveryTrackingNotes}</span>
              </div>
            )}
            {currentOrderStatus === 'delivered' && (
              <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-[#065F46]">
                Delivered! Click any item on the left to share a verified product review.
              </div>
            )}
          </div>
        </div>

        {/* Status History Timeline & Related Notifications */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 bg-white border border-zinc-200/80 rounded-2xl p-6 space-y-4">
            <h2 className="font-display text-lg font-bold text-zinc-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#065F46]" />
              <span>Order & Payment Status History</span>
            </h2>
            {combinedHistory.length === 0 ? (
              <p className="text-xs text-zinc-500">Order history is recorded automatically as updates happen.</p>
            ) : (
              <ol className="space-y-3 border-l-2 border-zinc-200 ml-2 pl-4">
                {combinedHistory.map((h, idx) => {
                  const statusText =
                    h.statusField === 'paymentStatus'
                      ? PAYMENT_STATUS_LABELS[h.newStatus] || h.newStatus
                      : ORDER_STATUS_LABELS[h.newStatus] || h.newStatus;
                  return (
                    <li key={h.historyId || idx} className="relative text-xs">
                      <span className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-[#065F46] ring-4 ring-white" />
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-zinc-900">
                          {h.statusField === 'paymentStatus' ? 'Payment' : 'Order'}: {statusText}
                        </span>
                        <span className="text-zinc-400">
                          {formatLagosDateTime(h.timestamp)} (WAT)
                        </span>
                      </div>
                      {h.notes && <p className="text-zinc-600 mt-0.5">{h.notes}</p>}
                    </li>
                  );
                })}
              </ol>
            )}
          </div>

          <div className="lg:col-span-5 bg-white border border-zinc-200/80 rounded-2xl p-6 space-y-4">
            <h2 className="font-display text-lg font-bold text-zinc-900 flex items-center gap-2">
              <Bell className="w-4 h-4 text-[#065F46]" />
              <span>Order Alerts</span>
            </h2>
            {orderNotifications.length === 0 ? (
              <p className="text-xs text-zinc-500">No order alerts yet.</p>
            ) : (
              <div className="divide-y divide-zinc-100 text-xs">
                {orderNotifications.map((n) => (
                  <div key={n.notificationId} className="py-2.5 space-y-0.5">
                    <p className="font-semibold text-zinc-900">{n.title}</p>
                    <p className="text-zinc-600">{n.message}</p>
                    <p className="text-[11px] text-zinc-400">{formatLagosDateTime(n.createdAt)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </StoreLayout>
  );
}

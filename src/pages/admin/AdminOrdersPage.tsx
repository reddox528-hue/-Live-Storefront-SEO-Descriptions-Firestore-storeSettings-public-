import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  CheckCircle2,
  XCircle,
  ArrowLeft,
  ExternalLink,
  PackageCheck,
  Clock,
  RotateCcw,
  History,
  Copy,
  Check,
  Ban,
} from 'lucide-react';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { AdminLayout } from '../../components/AdminLayout';
import { db } from '../../firebase';
import {
  DeliveryStatus,
  Order,
  OrderStatus,
  OrderStatusHistoryEntry,
  PaymentSubmission,
} from '../../types/ecommerce';
import {
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  deriveOrderStatus,
  formatLagosDateTime,
  formatNaira,
  getLagosDateKey,
  mapOrderStatusToDeliveryStatus,
  toDateMillis,
} from '../../utils/nigerianCurrency';
import {
  adminMarkOrderReceived,
  adminRecordRefundConfirmed,
  adminRejectPayment,
  adminUpdateOrderStatus,
  adminVerifyPayment,
} from '../../services/storefrontService';
import { useAuth } from '../../context/AuthContext';
import { useStore } from '../../context/StoreContext';

function orderStatusBadgeClass(status: string): string {
  switch (status) {
    case 'pending':
      return 'bg-amber-100 text-amber-900 border-amber-300';
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
      return 'bg-slate-100 text-slate-700 border-slate-200';
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

export function AdminOrdersPage() {
  const { firebaseUser } = useAuth();
  const { showToast, refreshStoreData } = useStore();

  const [orders, setOrders] = useState<Order[]>([]);
  const [search, setSearch] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [dateWindowFilter, setDateWindowFilter] = useState<'all' | 'today' | '7d' | '30d'>('all');
  const [specificDate, setSpecificDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [markingId, setMarkingId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'orders'),
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as Order)
          .sort((a, b) => toDateMillis(b.createdAt) - toDateMillis(a.createdAt));
        setOrders(list);
        setLoading(false);
      },
      () => {
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const counts = useMemo(() => {
    let pendingAck = 0;
    let paymentSubmitted = 0;
    let inFulfillment = 0;
    let delivered = 0;
    for (const o of orders) {
      const os = deriveOrderStatus(o);
      if (os === 'pending') pendingAck++;
      if (os === 'received' || os === 'processing' || os === 'ready_for_dispatch' || os === 'out_for_delivery') {
        inFulfillment++;
      }
      if (os === 'delivered') delivered++;
      if (o.paymentStatus === 'payment_submitted' || o.paymentStatus === 'under_verification') {
        paymentSubmitted++;
      }
    }
    return { pendingAck, paymentSubmitted, inFulfillment, delivered };
  }, [orders]);

  const filtered = useMemo(() => {
    const nowMs = Date.now();
    const todayKey = getLagosDateKey(new Date(nowMs));
    const exactDateKey = specificDate ? specificDate.replace(/-/g, '') : '';

    return orders.filter((o) => {
      const os = deriveOrderStatus(o);
      if (orderStatusFilter !== 'all' && os !== orderStatusFilter) return false;
      if (paymentFilter !== 'all' && o.paymentStatus !== paymentFilter) return false;

      const createdMs = toDateMillis(o.createdAt);
      if (exactDateKey && createdMs > 0) {
        const orderDayKey = getLagosDateKey(new Date(createdMs));
        if (orderDayKey !== exactDateKey) return false;
      } else if (dateWindowFilter !== 'all' && createdMs > 0) {
        if (dateWindowFilter === 'today') {
          if (getLagosDateKey(new Date(createdMs)) !== todayKey) return false;
        } else if (dateWindowFilter === '7d') {
          if (nowMs - createdMs > 7 * 24 * 60 * 60 * 1000) return false;
        } else if (dateWindowFilter === '30d') {
          if (nowMs - createdMs > 30 * 24 * 60 * 60 * 1000) return false;
        }
      }

      const q = search.trim().toLowerCase();
      if (q) {
        const hay =
          `${o.orderNumber} ${o.orderId} ${o.customerSnapshot.fullName} ${o.customerSnapshot.email} ${o.customerSnapshot.phone}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [orders, orderStatusFilter, paymentFilter, dateWindowFilter, specificDate, search]);

  const handleQuickMarkReceived = async (order: Order) => {
    if (!firebaseUser) return;
    setMarkingId(order.orderId);
    try {
      const res = await adminMarkOrderReceived({
        orderId: order.orderId,
        adminUid: firebaseUser.uid,
        adminEmail: firebaseUser.email || '',
      });
      await refreshStoreData();
      if (res.transitioned) {
        showToast(`Order ${order.orderNumber} marked Received and confirmation email queued.`);
      } else {
        showToast(`Order ${order.orderNumber} was already acknowledged.`);
      }
    } catch (err: any) {
      showToast(err?.message || 'Could not mark order as received.', 'error');
    } finally {
      setMarkingId(null);
    }
  };

  return (
    <AdminLayout title="Orders & Acknowledgement">
      <div className="space-y-4">
        {/* Live Summary Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <button
            type="button"
            onClick={() => setOrderStatusFilter(orderStatusFilter === 'pending' ? 'all' : 'pending')}
            className={`text-left p-4 rounded-xl border transition-colors cursor-pointer ${
              orderStatusFilter === 'pending'
                ? 'bg-amber-50 border-amber-400'
                : counts.pendingAck > 0
                  ? 'bg-amber-50/70 border-amber-200 hover:border-amber-300'
                  : 'bg-white border-slate-200 hover:border-slate-300'
            }`}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-800">
              Pending Acknowledgement
            </p>
            <p className="font-mono text-2xl font-bold text-slate-900 mt-1">{counts.pendingAck}</p>
          </button>

          <button
            type="button"
            onClick={() =>
              setPaymentFilter(paymentFilter === 'payment_submitted' ? 'all' : 'payment_submitted')
            }
            className={`text-left p-4 rounded-xl border transition-colors cursor-pointer ${
              paymentFilter === 'payment_submitted'
                ? 'bg-sky-50 border-sky-400'
                : 'bg-white border-slate-200 hover:border-slate-300'
            }`}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wider text-sky-800">
              Payments Submitted
            </p>
            <p className="font-mono text-2xl font-bold text-slate-900 mt-1">
              {counts.paymentSubmitted}
            </p>
          </button>

          <div className="p-4 rounded-xl border border-slate-200 bg-white">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Active Fulfillment
            </p>
            <p className="font-mono text-2xl font-bold text-slate-900 mt-1">
              {counts.inFulfillment}
            </p>
          </div>

          <div className="p-4 rounded-xl border border-slate-200 bg-white">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#065F46]">
              Delivered Orders
            </p>
            <p className="font-mono text-2xl font-bold text-slate-900 mt-1">{counts.delivered}</p>
          </div>
        </div>

        {/* Search & Independent Filters */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap gap-3 items-center">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search order # (e.g. ORD-20261113-0001), customer name, email, phone..."
            className="px-3.5 py-2 text-sm border border-slate-300 rounded-lg bg-white flex-1 min-w-[240px]"
          />
          <select
            value={orderStatusFilter}
            onChange={(e) => setOrderStatusFilter(e.target.value)}
            aria-label="Filter by Order Status"
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
          >
            <option value="all">All Order Statuses</option>
            {Object.entries(ORDER_STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                Order: {v}
              </option>
            ))}
          </select>
          <select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}
            aria-label="Filter by Payment Status"
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
          >
            <option value="all">All Payment Statuses</option>
            {Object.entries(PAYMENT_STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                Payment: {v}
              </option>
            ))}
          </select>
          <select
            value={dateWindowFilter}
            onChange={(e) => {
              setDateWindowFilter(e.target.value as 'all' | 'today' | '7d' | '30d');
              setSpecificDate('');
            }}
            aria-label="Filter by Date Window"
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
          >
            <option value="all">All Dates</option>
            <option value="today">Today (WAT)</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
          </select>
          <input
            type="date"
            value={specificDate}
            onChange={(e) => {
              setSpecificDate(e.target.value);
              if (e.target.value) setDateWindowFilter('all');
            }}
            aria-label="Specific Order Date"
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
          />
          {(search ||
            orderStatusFilter !== 'all' ||
            paymentFilter !== 'all' ||
            dateWindowFilter !== 'all' ||
            specificDate) && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setOrderStatusFilter('all');
                setPaymentFilter('all');
                setDateWindowFilter('all');
                setSpecificDate('');
              }}
              className="px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg cursor-pointer"
            >
              Reset
            </button>
          )}
        </div>

        {/* Orders Table */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {loading ? (
            <div className="p-8 text-sm text-slate-500">Loading live orders...</div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              No orders match your current search or filter criteria.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="py-3 px-4">Order #</th>
                    <th className="py-3 px-4">Customer</th>
                    <th className="py-3 px-4">Date (WAT)</th>
                    <th className="py-3 px-4">Order Status</th>
                    <th className="py-3 px-4">Payment Status</th>
                    <th className="py-3 px-4 text-right">Total</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((o) => {
                    const currentOrderStatus = deriveOrderStatus(o);
                    const isPendingAck = currentOrderStatus === 'pending';

                    return (
                      <tr
                        key={o.orderId}
                        className={
                          isPendingAck
                            ? 'bg-amber-50/70 hover:bg-amber-50 transition-colors'
                            : 'hover:bg-slate-50 transition-colors'
                        }
                      >
                        <td className="py-3 px-4 font-mono font-bold text-slate-900 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            {isPendingAck && (
                              <span
                                title="Awaiting administrator acknowledgement"
                                className="inline-block w-2 h-2 rounded-full bg-amber-500 shrink-0"
                              />
                            )}
                            <span>{o.orderNumber}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <p className="font-medium text-slate-900">{o.customerSnapshot.fullName}</p>
                          <p className="text-slate-500">{o.customerSnapshot.phone}</p>
                        </td>
                        <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                          {formatLagosDateTime(o.createdAt)}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md border font-semibold ${orderStatusBadgeClass(
                              currentOrderStatus
                            )}`}
                          >
                            {isPendingAck && <Clock className="w-3 h-3" />}
                            <span>
                              {ORDER_STATUS_LABELS[currentOrderStatus] || currentOrderStatus}
                            </span>
                          </span>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-md border font-semibold ${paymentStatusBadgeClass(
                              o.paymentStatus
                            )}`}
                          >
                            {PAYMENT_STATUS_LABELS[o.paymentStatus] || o.paymentStatus}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-semibold tabular-nums whitespace-nowrap">
                          {formatNaira(o.totalKobo)}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-2">
                            {isPendingAck && (
                              <button
                                type="button"
                                disabled={markingId === o.orderId}
                                onClick={() => handleQuickMarkReceived(o)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#065F46] text-white font-semibold hover:bg-[#047857] cursor-pointer disabled:opacity-60"
                              >
                                <PackageCheck className="w-3.5 h-3.5" />
                                <span>
                                  {markingId === o.orderId ? 'Marking...' : 'MARK AS RECEIVED'}
                                </span>
                              </button>
                            )}
                            <Link
                              to={`/admin/orders/${o.orderId}`}
                              className="px-3 py-1.5 rounded-lg border border-slate-300 font-medium text-slate-800 hover:bg-slate-900 hover:text-white bg-white"
                            >
                              Manage
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}

export function AdminOrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const { firebaseUser } = useAuth();
  const { showToast, refreshStoreData } = useStore();

  const [order, setOrder] = useState<Order | null>(null);
  const [payments, setPayments] = useState<PaymentSubmission[]>([]);
  const [historyEntries, setHistoryEntries] = useState<OrderStatusHistoryEntry[]>([]);
  const [orderStatus, setOrderStatus] = useState<OrderStatus>('pending');
  const [trackingNotes, setTrackingNotes] = useState('');
  const [personnel, setPersonnel] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [cancellationReason, setCancellationReason] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [verifyNotes, setVerifyNotes] = useState('');
  const [refundNotes, setRefundNotes] = useState('');
  const [copiedNum, setCopiedNum] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!orderId) return;

    const unsubOrder = onSnapshot(doc(db, 'orders', orderId), (snap) => {
      if (snap.exists()) {
        const ord = snap.data() as Order;
        setOrder(ord);
        setOrderStatus(deriveOrderStatus(ord) as OrderStatus);
        setTrackingNotes((prev) => prev || ord.deliveryTrackingNotes || '');
        setPersonnel((prev) => prev || ord.deliveryPersonnel || '');
        setAdminNotes((prev) => prev || ord.adminNotes || '');
        setCancellationReason((prev) => prev || ord.cancellationReason || '');
      } else {
        setOrder(null);
      }
    });

    const unsubPayments = onSnapshot(
      query(collection(db, 'payments'), where('orderId', '==', orderId)),
      (snap) => {
        setPayments(
          snap.docs
            .map((d) => d.data() as PaymentSubmission)
            .sort((a, b) => toDateMillis(b.createdAt) - toDateMillis(a.createdAt))
        );
      }
    );

    const unsubHistory = onSnapshot(
      query(collection(db, 'orderStatusHistory'), where('orderId', '==', orderId)),
      (snap) => {
        setHistoryEntries(
          snap.docs
            .map((d) => d.data() as OrderStatusHistoryEntry)
            .sort((a, b) => toDateMillis(a.timestamp) - toDateMillis(b.timestamp))
        );
      }
    );

    return () => {
      unsubOrder();
      unsubPayments();
      unsubHistory();
    };
  }, [orderId]);

  const combinedHistory = useMemo(() => {
    const map = new Map<string, OrderStatusHistoryEntry>();
    for (const h of order?.statusHistory || []) {
      const k = h.historyId || `${h.statusField}_${h.newStatus}_${toDateMillis(h.timestamp)}`;
      map.set(k, h);
    }
    for (const h of historyEntries) {
      const k = h.historyId || `${h.statusField}_${h.newStatus}_${toDateMillis(h.timestamp)}`;
      map.set(k, h);
    }
    return Array.from(map.values()).sort(
      (a, b) => toDateMillis(b.timestamp) - toDateMillis(a.timestamp)
    );
  }, [order?.statusHistory, historyEntries]);

  if (!order || !firebaseUser) {
    return (
      <AdminLayout title="Order Details">
        <div className="text-sm text-slate-500">Loading order details...</div>
      </AdminLayout>
    );
  }

  const currentOrderStatus = deriveOrderStatus(order) as OrderStatus;
  const isPendingAck = currentOrderStatus === 'pending';

  const handleCopyOrderNumber = async () => {
    try {
      await navigator.clipboard.writeText(order.orderNumber);
      setCopiedNum(true);
      setTimeout(() => setCopiedNum(false), 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleMarkAsReceived = async () => {
    setBusy(true);
    try {
      const res = await adminMarkOrderReceived({
        orderId: order.orderId,
        adminUid: firebaseUser.uid,
        adminEmail: firebaseUser.email || '',
      });
      await refreshStoreData();
      if (res.transitioned) {
        showToast(`Order ${order.orderNumber} marked Received. Emails queued for customer & admin.`);
      } else {
        showToast('Order was already acknowledged.');
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to mark order as received.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyPayment = async (paymentId: string) => {
    setBusy(true);
    try {
      await adminVerifyPayment({
        paymentId,
        orderId: order.orderId,
        adminUid: firebaseUser.uid,
        adminEmail: firebaseUser.email || '',
        notes: verifyNotes,
      });
      await refreshStoreData();
      showToast('Payment confirmed Paid and inventory updated. Order Status remains independent.');
    } catch (err: any) {
      showToast(err?.message || 'Verification failed.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleRejectPayment = async (paymentId: string) => {
    if (!rejectReason.trim()) {
      showToast('Enter a rejection reason first.', 'error');
      return;
    }
    setBusy(true);
    try {
      await adminRejectPayment({
        paymentId,
        orderId: order.orderId,
        adminUid: firebaseUser.uid,
        adminEmail: firebaseUser.email || '',
        reason: rejectReason,
      });
      setRejectReason('');
      showToast('Payment rejected and customer notified.');
    } catch (err: any) {
      showToast(err?.message || 'Rejection failed.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleRecordRefund = async () => {
    if (!refundNotes.trim()) {
      showToast('Enter refund reference / notes before confirming.', 'error');
      return;
    }
    setBusy(true);
    try {
      await adminRecordRefundConfirmed({
        orderId: order.orderId,
        adminUid: firebaseUser.uid,
        adminEmail: firebaseUser.email || '',
        refundNotes: refundNotes.trim(),
      });
      setRefundNotes('');
      await refreshStoreData();
      showToast('Refund confirmed and customer notified by email.');
    } catch (err: any) {
      showToast(err?.message || 'Could not record refund.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleUpdateStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (orderStatus === 'cancelled' && !cancellationReason.trim()) {
      showToast('Please enter a cancellation reason before cancelling an order.', 'error');
      return;
    }
    setBusy(true);
    try {
      await adminUpdateOrderStatus({
        orderId: order.orderId,
        orderStatus,
        deliveryStatus: mapOrderStatusToDeliveryStatus(orderStatus) as DeliveryStatus,
        deliveryTrackingNotes: trackingNotes,
        deliveryPersonnel: personnel,
        adminNotes,
        cancellationReason: orderStatus === 'cancelled' ? cancellationReason.trim() : undefined,
        adminUid: firebaseUser.uid,
        adminEmail: firebaseUser.email || '',
      });
      await refreshStoreData();
      showToast(
        `Order ${order.orderNumber} updated to ${ORDER_STATUS_LABELS[orderStatus] || orderStatus}.`
      );
    } catch (err: any) {
      showToast(err?.message || 'Could not update order status.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminLayout
      title={`Order ${order.orderNumber}`}
      actions={
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleCopyOrderNumber}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-mono font-semibold text-slate-800 hover:bg-slate-50 cursor-pointer"
          >
            {copiedNum ? <Check className="w-3.5 h-3.5 text-[#065F46]" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{order.orderNumber}</span>
          </button>
          <Link
            to="/admin/orders"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>All Orders</span>
          </Link>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Prominent Admin Order Acknowledgement Banner */}
        {isPendingAck ? (
          <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-200/80 text-amber-900 flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-display font-bold text-slate-900 text-base">
                  Action Required: Acknowledge New Order
                </h2>
                <p className="text-xs text-slate-700 mt-0.5 max-w-2xl">
                  Clicking <strong>MARK AS RECEIVED</strong> transitions Order Status from{' '}
                  <strong>Pending</strong> to <strong>Received</strong>, records your administrator
                  audit trail, updates the customer&apos;s account live, and sends acknowledgement
                  emails—even while payment verification remains independent.
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={handleMarkAsReceived}
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#065F46] text-white text-xs font-bold tracking-wide hover:bg-[#047857] cursor-pointer disabled:opacity-60 shrink-0 shadow-sm"
            >
              <PackageCheck className="w-4 h-4" />
              <span>{busy ? 'Acknowledging...' : 'MARK AS RECEIVED'}</span>
            </button>
          </div>
        ) : (order.receivedAt || order.receivedByEmail) && (
          <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-[#065F46] font-semibold">
              <PackageCheck className="w-4 h-4" />
              <span>Order Acknowledged (Received)</span>
            </div>
            <p className="text-slate-600">
              Acknowledged by{' '}
              <span className="font-semibold text-slate-900">
                {order.receivedByEmail || order.receivedBy || 'Store Admin'}
              </span>{' '}
              {order.receivedAt ? `· ${formatLagosDateTime(order.receivedAt)} WAT` : ''}
            </p>
          </div>
        )}

        {/* Independent Order Status vs Payment Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Order Fulfillment Status (Independent)
              </p>
              <p className="font-display text-xl font-bold text-slate-900 mt-1">
                {ORDER_STATUS_LABELS[currentOrderStatus] || currentOrderStatus}
              </p>
              {currentOrderStatus === 'cancelled' && order.cancellationReason && (
                <p className="text-xs text-red-700 mt-1.5 flex items-center gap-1">
                  <Ban className="w-3.5 h-3.5 shrink-0" />
                  <span>Reason: {order.cancellationReason}</span>
                </p>
              )}
            </div>
            <span
              className={`inline-flex items-center px-3 py-1 rounded-md border text-xs font-semibold ${orderStatusBadgeClass(
                currentOrderStatus
              )}`}
            >
              {ORDER_STATUS_LABELS[currentOrderStatus] || currentOrderStatus}
            </span>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Bank Transfer Payment Status (Independent)
              </p>
              <p className="font-display text-xl font-bold text-slate-900 mt-1">
                {PAYMENT_STATUS_LABELS[order.paymentStatus] || order.paymentStatus}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Placed {formatLagosDateTime(order.createdAt)} WAT · Total{' '}
                <strong className="font-mono text-slate-800">{formatNaira(order.totalKobo)}</strong>
              </p>
            </div>
            <span
              className={`inline-flex items-center px-3 py-1 rounded-md border text-xs font-semibold ${paymentStatusBadgeClass(
                order.paymentStatus
              )}`}
            >
              {PAYMENT_STATUS_LABELS[order.paymentStatus] || order.paymentStatus}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-7 space-y-6">
            {/* Payment Verification Section */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display font-semibold text-slate-900">
                  Bank Transfer Submissions
                </h2>
                <span
                  className={`text-xs font-semibold px-2.5 py-0.5 rounded-md border ${paymentStatusBadgeClass(
                    order.paymentStatus
                  )}`}
                >
                  Payment Status: {PAYMENT_STATUS_LABELS[order.paymentStatus] || order.paymentStatus}
                </span>
              </div>

              {payments.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Customer has not submitted transfer proof yet. Bank transfer payments are never
                  auto-marked as Paid.
                </p>
              ) : (
                <div className="space-y-4">
                  {payments.map((p) => (
                    <div
                      key={p.paymentId}
                      className="p-4 rounded-xl border border-slate-200 space-y-3 text-sm"
                    >
                      <div className="flex flex-wrap justify-between gap-2">
                        <div>
                          <p className="font-mono font-bold text-slate-900">
                            Ref: {p.transferReference}
                          </p>
                          <p className="text-xs text-slate-500">
                            Transfer Date: {p.transferDate} · Amount: {formatNaira(p.amountKobo)}
                          </p>
                        </div>
                        <span
                          className={`text-xs font-semibold px-2 py-0.5 rounded-md border h-fit ${paymentStatusBadgeClass(
                            p.status
                          )}`}
                        >
                          {PAYMENT_STATUS_LABELS[p.status] || p.status}
                        </span>
                      </div>

                      {p.receiptImageUrl && (
                        <div className="space-y-1.5">
                          <a
                            href={p.receiptImageUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-medium text-[#065F46] hover:underline"
                          >
                            <span>Open Customer Receipt</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      )}

                      {p.verificationNotes && (
                        <p className="text-xs text-slate-600 bg-slate-50 px-3 py-2 rounded-lg">
                          Verification note: {p.verificationNotes}
                        </p>
                      )}

                      {(p.status === 'payment_submitted' || p.status === 'under_verification') && (
                        <div className="pt-3 border-t border-slate-100 space-y-3">
                          <input
                            type="text"
                            value={verifyNotes}
                            onChange={(e) => setVerifyNotes(e.target.value)}
                            placeholder="Verification note (optional, e.g. GTBank statement matched)"
                            className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                          />
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleVerifyPayment(p.paymentId)}
                              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#065F46] text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Confirm Bank Transfer Paid</span>
                            </button>
                          </div>
                          <div className="flex gap-2 pt-1">
                            <input
                              type="text"
                              value={rejectReason}
                              onChange={(e) => setRejectReason(e.target.value)}
                              placeholder="Reason for rejection (e.g. amount mismatch, unclear receipt)"
                              className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-lg"
                            />
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleRejectPayment(p.paymentId)}
                              className="inline-flex items-center gap-1 px-3.5 py-2 rounded-lg bg-red-600 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span>Reject</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Refund Confirmation Section (only after payment is verified Paid) */}
              {order.paymentStatus === 'paid' && (
                <div className="pt-4 border-t border-slate-200 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-purple-900">
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Record Bank Transfer Refund</span>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={refundNotes}
                      onChange={(e) => setRefundNotes(e.target.value)}
                      placeholder="Refund reference / bank reversal note (e.g. Reversed to GTBank 0123...)"
                      className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-lg"
                    />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={handleRecordRefund}
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-purple-700 text-white text-xs font-semibold hover:bg-purple-800 cursor-pointer disabled:opacity-60"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Confirm Refund</span>
                    </button>
                  </div>
                </div>
              )}

              {order.paymentStatus === 'refunded' && (
                <div className="p-3 rounded-lg bg-purple-50 border border-purple-200 text-xs text-purple-900">
                  <strong>Refund Confirmed:</strong> {order.refundNotes || 'Refund processed'}{' '}
                  {order.refundedAt ? `· ${formatLagosDateTime(order.refundedAt)} WAT` : ''}
                </div>
              )}
            </div>

            {/* Items Snapshot */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <h2 className="font-display font-semibold text-slate-900">Ordered Items</h2>
              <div className="divide-y divide-slate-100 text-sm">
                {order.items.map((item, idx) => (
                  <div key={idx} className="py-3 flex justify-between gap-4">
                    <div>
                      <p className="font-medium text-slate-900">{item.productName}</p>
                      <p className="text-xs text-slate-500 font-mono">
                        SKU: {item.sku} · Qty: {item.quantity} ×{' '}
                        {formatNaira(item.finalUnitPriceKobo)}
                      </p>
                    </div>
                    <span className="font-mono font-semibold tabular-nums">
                      {formatNaira(item.lineTotalKobo)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="border-t border-slate-200 pt-3 space-y-1 text-sm">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal</span>
                  <span className="font-mono tabular-nums">{formatNaira(order.subtotalKobo)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Discounts</span>
                  <span className="font-mono tabular-nums">
                    -{formatNaira(order.discountTotalKobo)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Delivery</span>
                  <span className="font-mono tabular-nums">
                    {formatNaira(order.deliveryFeeKobo)}
                  </span>
                </div>
                <div className="flex justify-between font-bold text-slate-900 pt-1">
                  <span>Total (NGN)</span>
                  <span className="font-mono tabular-nums">{formatNaira(order.totalKobo)}</span>
                </div>
              </div>
            </div>

            {/* Audit & Status History Timeline */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-slate-500" />
                <h2 className="font-display font-semibold text-slate-900">
                  Order & Payment Status History
                </h2>
              </div>
              {combinedHistory.length === 0 ? (
                <p className="text-xs text-slate-500">No status history entries recorded yet.</p>
              ) : (
                <div className="divide-y divide-slate-100 text-xs">
                  {combinedHistory.map((h, i) => (
                    <div key={h.historyId || i} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold text-slate-900">
                          {h.statusField === 'paymentStatus' ? 'Payment Status' : 'Order Status'}:{' '}
                          {h.previousStatus ? `${h.previousStatus} → ` : ''}
                          <span className="text-[#065F46]">{h.newStatus}</span>
                        </p>
                        {h.notes && <p className="text-slate-600 mt-0.5">{h.notes}</p>}
                        <p className="text-slate-400 mt-0.5">
                          By {h.changedByEmail || h.changedBy} ({h.changedByRole})
                        </p>
                      </div>
                      <span className="text-slate-500 whitespace-nowrap font-mono">
                        {formatLagosDateTime(h.timestamp)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Delivery & Order Status Controls Column */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-2 text-sm">
              <h2 className="font-display font-semibold text-slate-900 mb-2">
                Customer & Delivery Address
              </h2>
              <p className="font-medium text-slate-900">{order.customerSnapshot.fullName}</p>
              <p className="text-slate-600">{order.customerSnapshot.email}</p>
              <p className="font-mono text-xs text-slate-600">{order.customerSnapshot.phone}</p>
              <div className="pt-3 border-t border-slate-100 text-slate-700 space-y-1">
                <p>{order.deliveryAddress.streetAddress}</p>
                <p>
                  {order.deliveryAddress.city}, {order.deliveryAddress.lga},{' '}
                  {order.deliveryAddress.state}
                </p>
                {order.deliveryInstructions && (
                  <p className="text-xs text-slate-500 pt-1">Note: {order.deliveryInstructions}</p>
                )}
              </div>
            </div>

            <form
              onSubmit={handleUpdateStatus}
              className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
            >
              <h2 className="font-display font-semibold text-slate-900">
                Order Fulfillment Status Control
              </h2>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Order Status (7-Stage Lifecycle)
                </label>
                <select
                  value={orderStatus}
                  onChange={(e) => setOrderStatus(e.target.value as OrderStatus)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  {Object.entries(ORDER_STATUS_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>

              {orderStatus === 'cancelled' && (
                <div>
                  <label className="block text-xs font-medium text-red-700 mb-1">
                    Cancellation Reason * (Sent to customer & admin)
                  </label>
                  <textarea
                    rows={2}
                    required
                    value={cancellationReason}
                    onChange={(e) => setCancellationReason(e.target.value)}
                    placeholder="Explain why this order is being cancelled..."
                    className="w-full px-3 py-2 text-sm border border-red-300 rounded-lg"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Assigned Dispatch Rider / Courier
                </label>
                <input
                  type="text"
                  value={personnel}
                  onChange={(e) => setPersonnel(e.target.value)}
                  placeholder="e.g. Chidi (Lagos Dispatch Rider)"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Customer-Visible Tracking Notes
                </label>
                <textarea
                  rows={2}
                  value={trackingNotes}
                  onChange={(e) => setTrackingNotes(e.target.value)}
                  placeholder="Dispatched from Lekki hub; ETA 3pm."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Internal Admin Notes
                </label>
                <textarea
                  rows={2}
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="w-full py-2.5 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-[#065F46] cursor-pointer disabled:opacity-60"
              >
                {busy ? 'Saving Status...' : 'Update Order Status & Notify'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

export function AdminPaymentsQueuePage() {
  const [payments, setPayments] = useState<PaymentSubmission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'payments'),
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as PaymentSubmission)
          .sort((a, b) => toDateMillis(b.createdAt) - toDateMillis(a.createdAt));
        setPayments(list);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, []);

  return (
    <AdminLayout title="Bank Transfer Verification Queue">
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-sm text-slate-500">Loading payment submissions...</div>
        ) : payments.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            No bank transfer submissions recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="py-3 px-4">Transfer Ref</th>
                  <th className="py-3 px-4">Transfer Date</th>
                  <th className="py-3 px-4">Amount</th>
                  <th className="py-3 px-4">Payment Status</th>
                  <th className="py-3 px-4 text-right">Review</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payments.map((p) => (
                  <tr key={p.paymentId} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-mono font-semibold text-slate-900">
                      {p.transferReference}
                    </td>
                    <td className="py-3 px-4 text-slate-600">{p.transferDate}</td>
                    <td className="py-3 px-4 font-mono font-semibold tabular-nums">
                      {formatNaira(p.amountKobo)}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-md border font-semibold ${paymentStatusBadgeClass(
                          p.status
                        )}`}
                      >
                        {PAYMENT_STATUS_LABELS[p.status] || p.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Link
                        to={`/admin/orders/${p.orderId}`}
                        className="px-3 py-1.5 rounded-lg border border-slate-300 font-medium text-slate-800 hover:bg-slate-900 hover:text-white"
                      >
                        Inspect Order
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus,
  Trash2,
  Pencil,
  UploadCloud,
  Mail,
  RefreshCw,
  Send,
  Eye,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  X,
} from 'lucide-react';
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { AdminLayout } from '../../components/AdminLayout';
import { db } from '../../firebase';
import {
  AppNotification,
  AuditLog,
  DeliveryZone,
  EmailEventPreferences,
  EmailNotificationRecord,
  EmailPreferencesSettings,
  InventoryLog,
  Order,
  Product,
  ProductReview,
  StoreBankSettings,
  StorePrivateSettings,
  StorePublicSettings,
  UserProfile,
} from '../../types/ecommerce';
import {
  EMAIL_TYPE_LABELS,
  formatLagosDateTime,
  formatNaira,
  koboToNairaNumber,
  nairaToKobo,
  toDateMillis,
} from '../../utils/nigerianCurrency';
import { NIGERIAN_STATES } from '../../utils/nigeriaLocations';
import {
  adminAdjustProductStock,
  adminRetryEmailNotification,
  adminSendTestEmail,
  deleteDeliveryZone,
  deleteReviewAdmin,
  fetchAllDeliveryZonesAdmin,
  fetchAllOrdersAdmin,
  fetchAllProductsAdmin,
  fetchAllReviewsAdmin,
  fetchAllUsersAdmin,
  fetchBankSettings,
  fetchEmailPreferences,
  fetchInventoryLogsAdmin,
  fetchPrivateSettings,
  fetchPublicStoreSettings,
  generateId,
  markNotificationRead,
  moderateReviewAdmin,
  saveBankStoreSettings,
  saveEmailPreferences,
  savePrivateStoreSettings,
  savePublicStoreSettings,
  upsertDeliveryZone,
} from '../../services/storefrontService';
import { uploadFileToStorage } from '../../services/storageService';
import { useAuth } from '../../context/AuthContext';
import { useStore } from '../../context/StoreContext';
import {
  DEFAULT_BANK_SETTINGS,
  DEFAULT_EMAIL_PREFERENCES,
  DEFAULT_PRIVATE_SETTINGS,
  DEFAULT_PUBLIC_SETTINGS,
} from '../../config/defaultStoreContent';

// ==========================================
// 1. DELIVERY ZONES PAGE
// ==========================================
export function AdminDeliveryZonesPage() {
  const { showToast, refreshStoreData } = useStore();
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [supportedStates, setSupportedStates] = useState<string[]>(['Lagos']);
  const [locationsCsv, setLocationsCsv] = useState('');
  const [feeNaira, setFeeNaira] = useState('3500');
  const [thresholdNaira, setThresholdNaira] = useState('0');
  const [estimatedDays, setEstimatedDays] = useState('1–2 Business Days');
  const [isActive, setIsActive] = useState(true);

  const load = () => fetchAllDeliveryZonesAdmin().then(setZones);
  useEffect(() => {
    load();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (supportedStates.length === 0) {
      showToast('Select at least one Nigerian state.', 'error');
      return;
    }
    try {
      const id = editingId || generateId('zone');
      await upsertDeliveryZone(
        {
          zoneId: id,
          name: name.trim(),
          supportedStates,
          supportedLocations: locationsCsv
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          deliveryFeeKobo: nairaToKobo(Number(feeNaira) || 0),
          freeDeliveryThresholdKobo: nairaToKobo(Number(thresholdNaira) || 0),
          estimatedDeliveryDays: estimatedDays.trim(),
          isActive,
        },
        !editingId
      );
      await load();
      await refreshStoreData();
      setEditingId(null);
      setName('');
      showToast(editingId ? 'Delivery zone updated.' : 'Delivery zone created.');
    } catch (err: any) {
      showToast(err?.message || 'Failed to save zone.', 'error');
    }
  };

  const toggleState = (st: string) => {
    setSupportedStates((prev) =>
      prev.includes(st) ? prev.filter((s) => s !== st) : [...prev, st]
    );
  };

  return (
    <AdminLayout title="Delivery Zones & Fees">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <form
          onSubmit={handleSubmit}
          className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4"
        >
          <h2 className="font-display font-semibold text-slate-900">
            {editingId ? 'Edit Delivery Zone' : 'Create Nigerian Delivery Zone'}
          </h2>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Zone Name *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Lagos Metro Express"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Fee (₦) *</label>
              <input
                type="number"
                required
                min="0"
                value={feeNaira}
                onChange={(e) => setFeeNaira(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Free Above (₦, 0=none)
              </label>
              <input
                type="number"
                min="0"
                value={thresholdNaira}
                onChange={(e) => setThresholdNaira(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Estimated Delivery Time *
            </label>
            <input
              type="text"
              required
              value={estimatedDays}
              onChange={(e) => setEstimatedDays(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Supported States ({supportedStates.length} selected)
            </label>
            <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg p-2.5 grid grid-cols-2 gap-1.5 text-xs">
              {NIGERIAN_STATES.map((st) => (
                <label key={st} className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={supportedStates.includes(st)}
                    onChange={() => toggleState(st)}
                  />
                  <span>{st}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Specific Cities (optional, comma-separated; leave blank for whole state)
            </label>
            <input
              type="text"
              value={locationsCsv}
              onChange={(e) => setLocationsCsv(e.target.value)}
              placeholder="Lekki, Ikeja, Victoria Island"
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
            />
          </div>
          <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            <span>Zone Active</span>
          </label>
          <button
            type="submit"
            className="w-full py-2.5 rounded-lg bg-[#065F46] text-white text-sm font-semibold cursor-pointer inline-flex items-center justify-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>{editingId ? 'Save Zone' : 'Add Zone'}</span>
          </button>
        </form>

        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
              <tr>
                <th className="py-3 px-4">Zone</th>
                <th className="py-3 px-4">States</th>
                <th className="py-3 px-4">Fee</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {zones.map((z) => (
                <tr key={z.zoneId}>
                  <td className="py-3 px-4 font-medium text-slate-900">
                    {z.name}
                    <span className="block text-[11px] text-slate-400">{z.estimatedDeliveryDays}</span>
                  </td>
                  <td className="py-3 px-4 text-slate-600 max-w-[200px]">
                    {z.supportedStates.join(', ')}
                  </td>
                  <td className="py-3 px-4 font-mono font-semibold tabular-nums">
                    {formatNaira(z.deliveryFeeKobo)}
                  </td>
                  <td className="py-3 px-4">
                    {z.isActive ? (
                      <span className="text-[#065F46] font-medium">Active</span>
                    ) : (
                      <span className="text-slate-400">Disabled</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(z.zoneId);
                          setName(z.name);
                          setSupportedStates(z.supportedStates);
                          setLocationsCsv(z.supportedLocations.join(', '));
                          setFeeNaira(String(koboToNairaNumber(z.deliveryFeeKobo)));
                          setThresholdNaira(
                            String(koboToNairaNumber(z.freeDeliveryThresholdKobo || 0))
                          );
                          setEstimatedDays(z.estimatedDeliveryDays);
                          setIsActive(z.isActive);
                        }}
                        className="p-1.5 text-slate-600 hover:text-slate-900 cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await deleteDeliveryZone(z.zoneId);
                          await load();
                          await refreshStoreData();
                          showToast('Zone deleted.');
                        }}
                        className="p-1.5 text-slate-400 hover:text-red-600 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}

// ==========================================
// 2. INVENTORY MANAGEMENT PAGE
// ==========================================
export function AdminInventoryPage() {
  const { firebaseUser } = useAuth();
  const { showToast, refreshStoreData } = useStore();
  const [products, setProducts] = useState<Product[]>([]);
  const [logs, setLogs] = useState<InventoryLog[]>([]);
  const [selectedProd, setSelectedProd] = useState<Product | null>(null);
  const [newQty, setNewQty] = useState('0');
  const [reason, setReason] = useState('');

  const load = async () => {
    const [prods, lgs] = await Promise.all([
      fetchAllProductsAdmin(),
      fetchInventoryLogsAdmin(),
    ]);
    setProducts(prods);
    setLogs(lgs);
  };

  useEffect(() => {
    load();
  }, []);

  const handleAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProd || !firebaseUser) return;
    try {
      await adminAdjustProductStock({
        productId: selectedProd.productId,
        newQuantity: Math.max(0, Math.floor(Number(newQty) || 0)),
        changeType: Number(newQty) > selectedProd.stockQuantity ? 'restock' : 'manual_adjustment',
        reason: reason || 'Admin stock adjustment',
        adminUid: firebaseUser.uid,
      });
      setSelectedProd(null);
      setReason('');
      await Promise.all([load(), refreshStoreData()]);
      showToast('Inventory updated and movement logged.');
    } catch (err: any) {
      showToast(err?.message || 'Stock update failed.', 'error');
    }
  };

  return (
    <AdminLayout title="Inventory & Stock Logs">
      <div className="space-y-8">
        {selectedProd && (
          <form
            onSubmit={handleAdjust}
            className="bg-white border border-slate-200 rounded-xl p-5 flex flex-wrap items-end gap-4"
          >
            <div>
              <p className="text-xs text-slate-500">Adjusting Stock For</p>
              <p className="font-semibold text-sm text-slate-900">{selectedProd.name}</p>
            </div>
            <div>
              <label className="block text-xs text-slate-600 mb-1">New Quantity</label>
              <input
                type="number"
                min="0"
                required
                value={newQty}
                onChange={(e) => setNewQty(e.target.value)}
                className="w-28 px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs text-slate-600 mb-1">Reason *</label>
              <input
                type="text"
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Supplier restock / damaged goods recount"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-[#065F46] text-white text-xs font-semibold cursor-pointer"
            >
              Save Stock
            </button>
            <button
              type="button"
              onClick={() => setSelectedProd(null)}
              className="px-3 py-2 text-xs text-slate-500 cursor-pointer"
            >
              Cancel
            </button>
          </form>
        )}

        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 font-display font-semibold text-slate-900">
            Current Stock Levels
          </div>
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
              <tr>
                <th className="py-3 px-4">Product</th>
                <th className="py-3 px-4">SKU</th>
                <th className="py-3 px-4">In Stock</th>
                <th className="py-3 px-4">Alert</th>
                <th className="py-3 px-4 text-right">Adjust</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {products.map((p) => (
                <tr key={p.productId}>
                  <td className="py-3 px-4 font-medium text-slate-900">{p.name}</td>
                  <td className="py-3 px-4 font-mono text-slate-500">{p.sku}</td>
                  <td className="py-3 px-4 font-mono font-bold tabular-nums">{p.stockQuantity}</td>
                  <td className="py-3 px-4">
                    {p.stockQuantity === 0 ? (
                      <span className="text-red-600 font-semibold">Out of Stock</span>
                    ) : p.stockQuantity <= 5 ? (
                      <span className="text-amber-700 font-semibold">Low Stock</span>
                    ) : (
                      <span className="text-[#065F46]">Healthy</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedProd(p);
                        setNewQty(String(p.stockQuantity));
                      }}
                      className="px-3 py-1.5 rounded-lg border border-slate-300 font-medium hover:bg-slate-900 hover:text-white cursor-pointer"
                    >
                      Adjust
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 font-display font-semibold text-slate-900">
            Stock Movement Audit Log
          </div>
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
              <tr>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Product</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Change</th>
                <th className="py-3 px-4">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.slice(0, 25).map((l) => (
                <tr key={l.logId}>
                  <td className="py-2.5 px-4 text-slate-500">{formatLagosDateTime(l.createdAt)}</td>
                  <td className="py-2.5 px-4 font-medium">
                    {products.find((p) => p.productId === l.productId)?.name || l.productId}
                  </td>
                  <td className="py-2.5 px-4 font-mono">{l.changeType}</td>
                  <td className="py-2.5 px-4 font-mono tabular-nums">
                    {l.previousQuantity} → {l.newQuantity} ({l.quantityChanged >= 0 ? '+' : ''}
                    {l.quantityChanged})
                  </td>
                  <td className="py-2.5 px-4 text-slate-600">{l.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}

// ==========================================
// 3. CUSTOMERS PAGE
// ==========================================
export function AdminCustomersPage() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    Promise.all([fetchAllUsersAdmin(), fetchAllOrdersAdmin()]).then(([u, o]) => {
      setUsers(u);
      setOrders(o);
    });
  }, []);

  const filtered = users.filter((u) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      u.fullName.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.phone || '').toLowerCase().includes(q)
    );
  });

  return (
    <AdminLayout title="Customers">
      <div className="space-y-4">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search customers by name, email, or phone..."
          className="w-full max-w-md px-3.5 py-2 text-sm border border-slate-300 rounded-lg bg-white"
        />
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
              <tr>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Phone</th>
                <th className="py-3 px-4">Orders</th>
                <th className="py-3 px-4">Verified Spend</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((u) => {
                const custOrders = orders.filter((o) => o.customerId === u.uid);
                const spend = custOrders
                  .filter((o) => o.paymentStatus === 'paid')
                  .reduce((sum, o) => sum + o.totalKobo, 0);
                return (
                  <tr key={u.uid}>
                    <td className="py-3 px-4">
                      <p className="font-medium text-slate-900">{u.fullName}</p>
                      <p className="text-slate-500">{u.email}</p>
                    </td>
                    <td className="py-3 px-4 font-mono">{u.phone || '—'}</td>
                    <td className="py-3 px-4 font-mono tabular-nums">{custOrders.length}</td>
                    <td className="py-3 px-4 font-mono font-semibold tabular-nums">
                      {formatNaira(spend)}
                    </td>
                    <td className="py-3 px-4 capitalize">{u.accountStatus}</td>
                    <td className="py-3 px-4 text-slate-500">
                      {formatLagosDateTime(u.createdAt, false)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}

// ==========================================
// 4. REVIEWS MODERATION PAGE
// ==========================================
export function AdminReviewsPage() {
  const { showToast, refreshStoreData } = useStore();
  const [reviews, setReviews] = useState<ProductReview[]>([]);

  const load = () => fetchAllReviewsAdmin().then(setReviews);
  useEffect(() => {
    load();
  }, []);

  return (
    <AdminLayout title="Reviews Moderation">
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {reviews.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">No product reviews yet.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {reviews.map((r) => (
              <div key={r.reviewId} className="p-5 flex flex-col sm:flex-row justify-between gap-4 text-sm">
                <div className="space-y-1">
                  <p className="font-semibold text-slate-900">
                    {r.customerName} · {r.rating}/5 Stars
                  </p>
                  <p className="text-slate-700">{r.comment}</p>
                  <p className="text-xs text-slate-400">
                    Status: {r.isApproved ? 'Approved (Public)' : 'Pending Moderation'}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={async () => {
                      await moderateReviewAdmin(r.reviewId, !r.isApproved);
                      await Promise.all([load(), refreshStoreData()]);
                      showToast(r.isApproved ? 'Review unpublished.' : 'Review approved.');
                    }}
                    className="px-3 py-1.5 rounded-lg bg-[#065F46] text-white text-xs font-medium cursor-pointer"
                  >
                    {r.isApproved ? 'Unpublish' : 'Approve'}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await deleteReviewAdmin(r.reviewId);
                      await Promise.all([load(), refreshStoreData()]);
                      showToast('Review deleted.');
                    }}
                    className="px-3 py-1.5 rounded-lg border border-red-200 text-red-600 text-xs font-medium cursor-pointer"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

// ==========================================
// 5. NOTIFICATIONS, EMAIL OUTBOX & AUDIT LOGS PAGE
// ==========================================
export function AdminNotificationsPage() {
  const { showToast } = useStore();
  const [activeTab, setActiveTab] = useState<'emails' | 'alerts' | 'audits'>('emails');
  const [notifs, setNotifs] = useState<AppNotification[]>([]);
  const [audits, setAudits] = useState<AuditLog[]>([]);
  const [emailRecords, setEmailRecords] = useState<EmailNotificationRecord[]>([]);
  const [emailSearch, setEmailSearch] = useState('');
  const [emailStatusFilter, setEmailStatusFilter] = useState<'all' | 'sent' | 'queued' | 'failed'>(
    'all'
  );
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [previewEmail, setPreviewEmail] = useState<EmailNotificationRecord | null>(null);

  useEffect(() => {
    const unsubNotifs = onSnapshot(
      query(collection(db, 'notifications'), where('recipientId', '==', 'admin')),
      (snap) => {
        setNotifs(
          snap.docs
            .map((d) => d.data() as AppNotification)
            .sort((a, b) => toDateMillis(b.createdAt) - toDateMillis(a.createdAt))
        );
      }
    );

    const unsubAudits = onSnapshot(
      query(collection(db, 'auditLogs'), orderBy('createdAt', 'desc'), limit(80)),
      (snap) => {
        setAudits(snap.docs.map((d) => d.data() as AuditLog));
      }
    );

    const unsubEmails = onSnapshot(
      query(collection(db, 'emailNotifications'), orderBy('createdAt', 'desc'), limit(150)),
      (snap) => {
        setEmailRecords(snap.docs.map((d) => d.data() as EmailNotificationRecord));
      }
    );

    return () => {
      unsubNotifs();
      unsubAudits();
      unsubEmails();
    };
  }, []);

  const emailStats = useMemo(() => {
    let sent = 0;
    let queued = 0;
    let failed = 0;
    for (const r of emailRecords) {
      if (r.status === 'sent') sent++;
      else if (r.status === 'queued') queued++;
      else failed++;
    }
    return { total: emailRecords.length, sent, queued, failed };
  }, [emailRecords]);

  const filteredEmails = useMemo(() => {
    const q = emailSearch.trim().toLowerCase();
    return emailRecords.filter((r) => {
      if (emailStatusFilter !== 'all' && r.status !== emailStatusFilter) return false;
      if (q) {
        const hay = `${r.orderNumber} ${r.recipient} ${r.subject} ${r.notificationType}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [emailRecords, emailStatusFilter, emailSearch]);

  const handleRetryEmail = async (rec: EmailNotificationRecord) => {
    setRetryingId(rec.notificationId);
    try {
      const res = await adminRetryEmailNotification(rec.notificationId);
      if (res.status === 'sent') {
        showToast(`Email for ${rec.orderNumber || rec.recipient} dispatched successfully.`);
      } else {
        showToast(res.failureReason || `Status: ${res.status}`, 'error');
      }
    } catch (err: any) {
      showToast(err?.message || 'Could not retry email.', 'error');
    } finally {
      setRetryingId(null);
    }
  };

  return (
    <AdminLayout title="Email Outbox, Alerts & Audit Trail">
      <div className="space-y-6">
        {/* Tabs */}
        <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
          <button
            type="button"
            onClick={() => setActiveTab('emails')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer inline-flex items-center gap-2 ${
              activeTab === 'emails'
                ? 'bg-slate-900 text-white'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Mail className="w-3.5 h-3.5" />
            <span>Automated Email Outbox ({emailRecords.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('alerts')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer ${
              activeTab === 'alerts'
                ? 'bg-slate-900 text-white'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            In-App Admin Alerts ({notifs.filter((n) => !n.isRead).length} unread)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('audits')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer ${
              activeTab === 'audits'
                ? 'bg-slate-900 text-white'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            Order & Payment Audit Trail ({audits.length})
          </button>
        </div>

        {/* Tab 1: Automated Email Outbox */}
        {activeTab === 'emails' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Total Recorded
                </p>
                <p className="font-mono text-2xl font-bold text-slate-900 mt-1">{emailStats.total}</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#065F46]">
                  Sent via Provider
                </p>
                <p className="font-mono text-2xl font-bold text-[#065F46] mt-1">{emailStats.sent}</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-700">
                  Queued
                </p>
                <p className="font-mono text-2xl font-bold text-amber-700 mt-1">
                  {emailStats.queued}
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-red-700">
                  Failed / Action Needed
                </p>
                <p className="font-mono text-2xl font-bold text-red-700 mt-1">{emailStats.failed}</p>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap gap-3 items-center justify-between">
              <div className="flex flex-wrap gap-3 flex-1">
                <input
                  type="search"
                  value={emailSearch}
                  onChange={(e) => setEmailSearch(e.target.value)}
                  placeholder="Search by order #, recipient email, or subject..."
                  className="px-3.5 py-2 text-sm border border-slate-300 rounded-lg bg-white flex-1 min-w-[220px]"
                />
                <select
                  value={emailStatusFilter}
                  onChange={(e) => setEmailStatusFilter(e.target.value as any)}
                  className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option value="all">All Delivery States</option>
                  <option value="sent">Sent</option>
                  <option value="queued">Queued</option>
                  <option value="failed">Failed</option>
                </select>
              </div>
              <Link
                to="/admin/settings"
                className="text-xs font-semibold text-[#065F46] hover:underline"
              >
                Configure Admin Email & Sender Preferences →
              </Link>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              {filteredEmails.length === 0 ? (
                <div className="p-10 text-center text-sm text-slate-500">
                  No email notification records match your filter.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                      <tr>
                        <th className="py-3 px-4">Order #</th>
                        <th className="py-3 px-4">Recipient</th>
                        <th className="py-3 px-4">Event & Subject</th>
                        <th className="py-3 px-4">Delivery State</th>
                        <th className="py-3 px-4">Timestamp (WAT)</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredEmails.map((rec) => (
                        <tr key={rec.notificationId} className="hover:bg-slate-50 align-top">
                          <td className="py-3 px-4 font-mono font-semibold text-slate-900 whitespace-nowrap">
                            {rec.orderId ? (
                              <Link
                                to={`/admin/orders/${rec.orderId}`}
                                className="text-[#065F46] hover:underline"
                              >
                                {rec.orderNumber || rec.orderId}
                              </Link>
                            ) : (
                              <span>{rec.orderNumber || 'SYSTEM'}</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <p className="font-medium text-slate-900">{rec.recipient}</p>
                            <span className="inline-block mt-0.5 text-[10px] uppercase tracking-wider font-semibold text-slate-500">
                              {rec.recipientType}
                            </span>
                          </td>
                          <td className="py-3 px-4 max-w-md">
                            <p className="font-semibold text-slate-900">
                              {EMAIL_TYPE_LABELS[rec.notificationType] || rec.notificationType}
                            </p>
                            <p className="text-slate-600 mt-0.5">{rec.subject}</p>
                            {rec.failureReason && (
                              <p className="text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1 mt-1.5">
                                {rec.failureReason}
                              </p>
                            )}
                            {rec.providerMessageId && (
                              <p className="text-[11px] font-mono text-slate-400 mt-1">
                                Brevo Message ID: {rec.providerMessageId}
                              </p>
                            )}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border font-semibold ${
                                rec.status === 'sent'
                                  ? 'bg-emerald-50 text-[#065F46] border-emerald-200'
                                  : rec.status === 'queued'
                                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                                    : 'bg-red-50 text-red-800 border-red-200'
                              }`}
                            >
                              {rec.status === 'sent' ? (
                                <CheckCircle2 className="w-3 h-3" />
                              ) : rec.status === 'queued' ? (
                                <AlertTriangle className="w-3 h-3" />
                              ) : (
                                <XCircle className="w-3 h-3" />
                              )}
                              <span>{rec.status.toUpperCase()}</span>
                            </span>
                            {rec.deliveryStatus && (
                              <p className="text-[11px] text-slate-500 mt-1">
                                Webhook: {rec.deliveryStatus.replace(/_/g, ' ')} · Attempts:{' '}
                                {rec.attemptCount || 0}
                              </p>
                            )}
                          </td>
                          <td className="py-3 px-4 text-slate-600 whitespace-nowrap font-mono">
                            {formatLagosDateTime(rec.sentAt || rec.lastAttemptAt || rec.createdAt)}
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-2">
                              {rec.htmlBody && (
                                <button
                                  type="button"
                                  onClick={() => setPreviewEmail(rec)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 cursor-pointer"
                                >
                                  <Eye className="w-3 h-3" />
                                  <span>Preview</span>
                                </button>
                              )}
                              {rec.status !== 'sent' && (
                                <button
                                  type="button"
                                  disabled={retryingId === rec.notificationId}
                                  onClick={() => handleRetryEmail(rec)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#065F46] text-white font-semibold hover:bg-[#047857] cursor-pointer disabled:opacity-60"
                                >
                                  <RefreshCw className="w-3 h-3" />
                                  <span>
                                    {retryingId === rec.notificationId ? 'Retrying...' : 'Retry'}
                                  </span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: In-App Admin Alerts */}
        {activeTab === 'alerts' && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="font-display font-semibold text-slate-900">In-App Admin Alerts</h2>
            {notifs.length === 0 ? (
              <p className="text-sm text-slate-500">No admin alerts yet.</p>
            ) : (
              <div className="divide-y divide-slate-100 text-xs">
                {notifs.map((n) => (
                  <div key={n.notificationId} className="py-3 flex justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">{n.title}</p>
                      <p className="text-slate-600 mt-0.5">{n.message}</p>
                      <p className="text-slate-400 mt-1">{formatLagosDateTime(n.createdAt)} WAT</p>
                    </div>
                    <div className="flex items-center gap-3 self-start">
                      {n.relatedOrderId && (
                        <Link
                          to={`/admin/orders/${n.relatedOrderId}`}
                          className="text-slate-700 font-medium hover:underline"
                        >
                          Open Order
                        </Link>
                      )}
                      {!n.isRead && (
                        <button
                          type="button"
                          onClick={() => markNotificationRead(n.notificationId)}
                          className="text-[#065F46] font-medium cursor-pointer"
                        >
                          Mark read
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Payment & Order Audit Trail */}
        {activeTab === 'audits' && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="font-display font-semibold text-slate-900">
              Payment & Order Audit Trail
            </h2>
            {audits.length === 0 ? (
              <p className="text-sm text-slate-500">No audit records yet.</p>
            ) : (
              <div className="divide-y divide-slate-100 text-xs">
                {audits.map((a) => (
                  <div key={a.logId} className="py-3 space-y-0.5">
                    <p className="font-mono font-semibold text-slate-900">{a.action}</p>
                    <p className="text-slate-600">{a.details}</p>
                    <p className="text-slate-400">
                      By {a.actorEmail || a.actorUid} · {formatLagosDateTime(a.createdAt)} WAT
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sandboxed Email HTML Preview Modal */}
      {previewEmail && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-2xl w-full overflow-hidden shadow-xl">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-mono text-slate-500">
                  To: {previewEmail.recipient} ({previewEmail.recipientType})
                </p>
                <h3 className="font-display font-semibold text-slate-900 text-sm">
                  {previewEmail.subject}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPreviewEmail(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 cursor-pointer"
                aria-label="Close email preview"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <iframe
              title="Email HTML Preview"
              sandbox=""
              srcDoc={previewEmail.htmlBody || ''}
              className="w-full h-[480px] bg-slate-50"
            />
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

// ==========================================
// 6. STORE SETTINGS PAGE
// ==========================================
const EMAIL_EVENT_TOGGLES: Array<{
  key: keyof EmailEventPreferences;
  label: string;
  description: string;
}> = [
  {
    key: 'orderPlacedCustomer',
    label: 'A. New Order Placed (Customer)',
    description: 'Sends order confirmation, items, NGN breakdown, and bank instructions on checkout.',
  },
  {
    key: 'orderPlacedAdmin',
    label: 'A. New Order Received (Admin)',
    description: 'Alerts admin email immediately with customer details and direct dashboard link.',
  },
  {
    key: 'orderPendingNotice',
    label: 'B. Separate Order Pending Notice (Optional)',
    description: 'Off by default so customers do not receive duplicate emails alongside New Order Placed.',
  },
  {
    key: 'orderReceivedCustomer',
    label: 'C. Order Received / Acknowledged (Customer)',
    description: 'Sent when admin clicks MARK AS RECEIVED.',
  },
  {
    key: 'orderReceivedAdmin',
    label: 'C. Order Received Confirmation (Admin)',
    description: 'Logs confirmation to admin email when an order is marked Received.',
  },
  {
    key: 'paymentSubmittedCustomer',
    label: 'D. Payment Submitted (Customer)',
    description: 'Confirms receipt upload and explains bank verification SLA.',
  },
  {
    key: 'paymentSubmittedAdmin',
    label: 'D. Payment Submitted Alert (Admin)',
    description: 'Notifies admin to verify bank transfer proof.',
  },
  {
    key: 'paymentVerifiedCustomer',
    label: 'E. Payment Verified / Paid (Customer)',
    description: 'Confirms transfer verification without altering order status automatically.',
  },
  {
    key: 'paymentVerifiedAdmin',
    label: 'E. Payment Verified Log (Admin)',
    description: 'Notifies admin email after a payment is confirmed Paid.',
  },
  {
    key: 'paymentRejectedCustomer',
    label: 'F. Payment Rejected (Customer)',
    description: 'Includes admin rejection reason and prompt to re-upload valid transfer proof.',
  },
  {
    key: 'paymentRejectedAdmin',
    label: 'F. Payment Rejected Log (Admin)',
    description: 'Copies rejection record to admin email.',
  },
  {
    key: 'orderProcessingCustomer',
    label: 'G. Order Processing (Customer)',
    description: 'Sent when order moves to Processing.',
  },
  {
    key: 'readyForDispatchCustomer',
    label: 'H. Ready for Dispatch (Customer)',
    description: 'Sent when order is packed and ready for courier pickup.',
  },
  {
    key: 'outForDeliveryCustomer',
    label: 'I. Out for Delivery (Customer)',
    description: 'Includes rider name and tracking notes when dispatched.',
  },
  {
    key: 'deliveredCustomer',
    label: 'J. Order Delivered (Customer)',
    description: 'Confirms delivery and invites a verified purchase review.',
  },
  {
    key: 'orderCancelledCustomer',
    label: 'K. Order Cancelled (Customer)',
    description: 'Includes cancellation reason and refund/support details if paid.',
  },
  {
    key: 'orderCancelledAdmin',
    label: 'K. Order Cancelled Log (Admin)',
    description: 'Sends cancellation record to admin notification email.',
  },
  {
    key: 'refundConfirmedCustomer',
    label: 'L. Refund Confirmed (Customer)',
    description: 'Sent when admin records a confirmed refund on a Paid order.',
  },
];

export function AdminSettingsPage() {
  const { showToast, refreshStoreData } = useStore();
  const [pub, setPub] = useState<Omit<StorePublicSettings, 'updatedAt'>>(DEFAULT_PUBLIC_SETTINGS);
  const [bank, setBank] = useState<Omit<StoreBankSettings, 'updatedAt'>>(DEFAULT_BANK_SETTINGS);
  const [priv, setPriv] = useState<Omit<StorePrivateSettings, 'updatedAt'>>(DEFAULT_PRIVATE_SETTINGS);
  const [emailPrefs, setEmailPrefs] =
    useState<Omit<EmailPreferencesSettings, 'updatedAt'>>(DEFAULT_EMAIL_PREFERENCES);
  const [testRecipient, setTestRecipient] = useState('');
  const [testingEmail, setTestingEmail] = useState(false);
  const [testResult, setTestResult] = useState<{
    status: string;
    deliveryStatus?: string;
    providerMessageId?: string;
    failureReason?: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      fetchPublicStoreSettings(),
      fetchBankSettings(),
      fetchPrivateSettings(),
      fetchEmailPreferences(),
    ]).then(([p, b, pr, ep]) => {
      setPub(p);
      setBank(b);
      setPriv(pr);
      setEmailPrefs(ep);
      setTestRecipient(ep.adminNotificationEmail || DEFAULT_EMAIL_PREFERENCES.adminNotificationEmail);
    });
  }, []);

  const handleSaveAll = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await Promise.all([
        savePublicStoreSettings(pub),
        saveBankStoreSettings(bank),
        savePrivateStoreSettings(priv),
        saveEmailPreferences(emailPrefs),
      ]);
      await refreshStoreData();
      showToast('All store & email notification settings saved to Firestore.');
    } catch (err: any) {
      showToast(err?.message || 'Failed to save store settings.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSendTestEmail = async () => {
    setTestingEmail(true);
    setTestResult(null);
    try {
      await saveEmailPreferences(emailPrefs);
      const res = await adminSendTestEmail(testRecipient || emailPrefs.adminNotificationEmail);
      setTestResult(res);
      if (res.status === 'sent') {
        showToast('Test email accepted by Brevo!');
      } else {
        showToast(res.failureReason || 'Email backend not configured yet.', 'error');
      }
    } catch (err: any) {
      const msg = err?.message || 'Failed to send test email.';
      setTestResult({ status: 'failed', deliveryStatus: 'failed', failureReason: msg });
      showToast(msg, 'error');
    } finally {
      setTestingEmail(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const url = await uploadFileToStorage(file, 'storefront/branding');
      setPub((prev) => ({ ...prev, logoUrl: url }));
      showToast('Logo uploaded.');
    } catch (err: any) {
      showToast(err?.message || 'Logo upload failed.', 'error');
    }
  };

  const handleHeroImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const url = await uploadFileToStorage(file, 'storefront/banners');
      setPub((prev) => ({ ...prev, heroImageUrl: url }));
      showToast('Hero banner image uploaded.');
    } catch (err: any) {
      showToast(err?.message || 'Hero image upload failed.', 'error');
    }
  };

  return (
    <AdminLayout title="Store Settings">
      <form onSubmit={handleSaveAll} className="space-y-8 max-w-4xl">
        {/* Brand & Contact */}
        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <h2 className="font-display font-semibold text-slate-900">
            Storefront Identity & Contact
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Store Name</label>
              <input
                type="text"
                required
                value={pub.storeName}
                onChange={(e) => setPub({ ...pub, storeName: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Tagline</label>
              <input
                type="text"
                value={pub.storeTagline}
                onChange={(e) => setPub({ ...pub, storeTagline: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Contact Email</label>
              <input
                type="email"
                value={pub.contactEmail}
                onChange={(e) => setPub({ ...pub, contactEmail: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Phone Number</label>
              <input
                type="text"
                value={pub.phoneNumber}
                onChange={(e) => setPub({ ...pub, phoneNumber: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">WhatsApp</label>
              <input
                type="text"
                value={pub.whatsappNumber}
                onChange={(e) => setPub({ ...pub, whatsappNumber: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Business Address
              </label>
              <input
                type="text"
                value={pub.businessAddress}
                onChange={(e) => setPub({ ...pub, businessAddress: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Logo URL / Upload
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={pub.logoUrl}
                onChange={(e) => setPub({ ...pub, logoUrl: e.target.value })}
                placeholder="/images/... or https://..."
                className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
              <label className="px-3 py-2 border border-slate-300 rounded-lg text-xs cursor-pointer inline-flex items-center gap-1">
                <UploadCloud className="w-3.5 h-3.5" />
                <span>Upload Logo</span>
                <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
              </label>
            </div>
          </div>
        </section>

        {/* Bank Transfer Details */}
        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <h2 className="font-display font-semibold text-slate-900">
            Bank Transfer Payment Configuration (NGN Only)
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Bank Name *</label>
              <input
                type="text"
                required
                value={bank.bankName}
                onChange={(e) => setBank({ ...bank, bankName: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Account Name *</label>
              <input
                type="text"
                required
                value={bank.accountName}
                onChange={(e) => setBank({ ...bank, accountName: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Account Number *
              </label>
              <input
                type="text"
                required
                value={bank.accountNumber}
                onChange={(e) => setBank({ ...bank, accountNumber: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Transfer Instructions
            </label>
            <textarea
              rows={2}
              value={bank.transferInstructions}
              onChange={(e) => setBank({ ...bank, transferInstructions: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
        </section>

        {/* Automated Email Notifications (Brevo + Secret Manager) */}
        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display font-semibold text-slate-900">
                Automated Email Notifications (Brevo)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Emails dispatch server-side via Brevo Transactional API & Firebase Secret Manager (
                <code className="font-mono">BREVO_API_KEY</code>). Never stored in frontend env.
              </p>
            </div>
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={emailPrefs.emailsEnabled}
                onChange={(e) =>
                  setEmailPrefs({ ...emailPrefs, emailsEnabled: e.target.checked })
                }
              />
              <span>Enable Automated Emails</span>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Admin Notification Email *
              </label>
              <input
                type="email"
                required
                value={emailPrefs.adminNotificationEmail}
                onChange={(e) =>
                  setEmailPrefs({ ...emailPrefs, adminNotificationEmail: e.target.value })
                }
                placeholder="orders-admin@koramarket.ng"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Sender Name</label>
              <input
                type="text"
                value={emailPrefs.senderName}
                onChange={(e) => setEmailPrefs({ ...emailPrefs, senderName: e.target.value })}
                placeholder="KoraMarket Nigeria"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Verified Sender Email (Brevo Sender)
              </label>
              <input
                type="email"
                value={emailPrefs.senderEmail}
                onChange={(e) => setEmailPrefs({ ...emailPrefs, senderEmail: e.target.value })}
                placeholder="orders@yourdomain.com (leave empty for BREVO_FROM_EMAIL env var)"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Reply-To Email</label>
              <input
                type="email"
                value={emailPrefs.replyToEmail}
                onChange={(e) => setEmailPrefs({ ...emailPrefs, replyToEmail: e.target.value })}
                placeholder="support@yourdomain.com"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600">
              Notification Event Triggers
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {EMAIL_EVENT_TOGGLES.map((item) => (
                <label
                  key={item.key}
                  className="flex items-start gap-2.5 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={emailPrefs.events[item.key]}
                    onChange={(e) =>
                      setEmailPrefs({
                        ...emailPrefs,
                        events: {
                          ...emailPrefs.events,
                          [item.key]: e.target.checked,
                        },
                      })
                    }
                    className="mt-0.5"
                  />
                  <div className="text-xs">
                    <p className="font-semibold text-slate-900">{item.label}</p>
                    <p className="text-slate-500 mt-0.5">{item.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Test Email Configuration Tool */}
          <div className="border-t border-slate-200 pt-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                Test Brevo Email Configuration
              </h3>
              <Link
                to="/admin/notifications"
                className="text-xs font-semibold text-[#065F46] hover:underline"
              >
                Inspect Email Outbox Logs →
              </Link>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="email"
                value={testRecipient}
                onChange={(e) => setTestRecipient(e.target.value)}
                placeholder="Recipient email for test"
                className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
              <button
                type="button"
                disabled={testingEmail}
                onClick={handleSendTestEmail}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-[#065F46] cursor-pointer disabled:opacity-60"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{testingEmail ? 'Testing...' : 'Send Test Email'}</span>
              </button>
            </div>
            {testResult && (
              <div
                className={`p-3 rounded-lg border text-xs ${
                  testResult.status === 'sent'
                    ? 'bg-emerald-50 border-emerald-200 text-[#065F46]'
                    : 'bg-red-50 border-red-200 text-red-800'
                }`}
              >
                <p className="font-semibold">
                  Test Outcome: {testResult.status.toUpperCase()}
                  {testResult.providerMessageId
                    ? ` (Brevo messageId: ${testResult.providerMessageId})`
                    : ''}
                </p>
                {testResult.failureReason && <p className="mt-1">{testResult.failureReason}</p>}
              </div>
            )}
          </div>
        </section>

        {/* Homepage Announcement & Hero */}
        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <h2 className="font-display font-semibold text-slate-900">Homepage & SEO</h2>
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={pub.announcementEnabled}
              onChange={(e) => setPub({ ...pub, announcementEnabled: e.target.checked })}
            />
            <input
              type="text"
              value={pub.announcementText}
              onChange={(e) => setPub({ ...pub, announcementText: e.target.value })}
              placeholder="Announcement bar text"
              className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Hero Headline</label>
              <input
                type="text"
                value={pub.heroTitle}
                onChange={(e) => setPub({ ...pub, heroTitle: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">SEO Title</label>
              <input
                type="text"
                value={pub.seoTitle}
                onChange={(e) => setPub({ ...pub, seoTitle: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Homepage Hero Image URL / Upload
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={pub.heroImageUrl}
                onChange={(e) => setPub({ ...pub, heroImageUrl: e.target.value })}
                placeholder="/images/hero_modern_commerce_1794563144049.jpg or https://..."
                className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-lg font-mono"
              />
              <label className="px-3 py-2 border border-slate-300 rounded-lg text-xs cursor-pointer inline-flex items-center gap-1 whitespace-nowrap">
                <UploadCloud className="w-3.5 h-3.5" />
                <span>Upload Hero</span>
                <input type="file" accept="image/*" onChange={handleHeroImageUpload} className="hidden" />
              </label>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              About Us Policy Copy
            </label>
            <textarea
              rows={3}
              value={pub.policies.aboutUs}
              onChange={(e) =>
                setPub({ ...pub, policies: { ...pub.policies, aboutUs: e.target.value } })
              }
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
        </section>

        {/* Private Operational Settings */}
        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <h2 className="font-display font-semibold text-slate-900">
            Private Operations & Alerts
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Low Stock Alert Threshold
              </label>
              <input
                type="number"
                min="1"
                value={priv.lowStockThreshold}
                onChange={(e) =>
                  setPriv({
                    ...priv,
                    lowStockThreshold: Math.max(1, Number(e.target.value) || 5),
                  })
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Order Number Prefix
              </label>
              <input
                type="text"
                value={priv.orderNumberPrefix}
                onChange={(e) =>
                  setPriv({ ...priv, orderNumberPrefix: e.target.value.toUpperCase() })
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
          </div>
        </section>

        <button
          type="submit"
          disabled={saving}
          className="px-6 py-3 rounded-xl bg-[#065F46] text-white text-sm font-semibold hover:bg-[#047857] cursor-pointer disabled:opacity-60"
        >
          {saving ? 'Saving Settings...' : 'Save All Store & Email Settings'}
        </button>
      </form>
    </AdminLayout>
  );
}

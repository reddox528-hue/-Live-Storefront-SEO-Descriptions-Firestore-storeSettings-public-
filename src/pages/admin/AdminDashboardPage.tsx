import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { AdminLayout } from '../../components/AdminLayout';
import { Order, Product, UserProfile } from '../../types/ecommerce';
import {
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  deriveOrderStatus,
  formatLagosDateTime,
  formatNaira,
  toDateMillis,
} from '../../utils/nigerianCurrency';
import {
  fetchAllProductsAdmin,
  fetchAllUsersAdmin,
  fetchPrivateSettings,
} from '../../services/storefrontService';

export function AdminDashboardPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [lowStockThreshold, setLowStockThreshold] = useState(5);
  const [dateRange, setDateRange] = useState<'all' | 'today' | '7d' | '30d'>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetchAllProductsAdmin(),
      fetchAllUsersAdmin(),
      fetchPrivateSettings(),
    ])
      .then(([prods, usrs, priv]) => {
        setProducts(prods);
        setUsers(usrs);
        setLowStockThreshold(priv.lowStockThreshold || 5);
      })
      .catch(() => {});

    const unsubOrders = onSnapshot(
      collection(db, 'orders'),
      (snap) => {
        setOrders(
          snap.docs
            .map((d) => d.data() as Order)
            .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
        );
        setLoading(false);
      },
      () => {
        setLoading(false);
      }
    );

    return () => unsubOrders();
  }, []);

  const filteredOrders = useMemo(() => {
    if (dateRange === 'all') return orders;
    const now = Date.now();
    const cutoff =
      dateRange === 'today'
        ? now - 24 * 60 * 60 * 1000
        : dateRange === '7d'
          ? now - 7 * 24 * 60 * 60 * 1000
          : now - 30 * 24 * 60 * 60 * 1000;
    return orders.filter((o) => toDateMillis(o.createdAt) >= cutoff);
  }, [orders, dateRange]);

  const stats = useMemo(() => {
    let verifiedRevenueKobo = 0;
    let pendingAckCount = 0;
    let openOrders = 0;
    let awaitingVerification = 0;
    let completedOrders = 0;

    for (const o of filteredOrders) {
      const oStatus = deriveOrderStatus(o);
      if (o.paymentStatus === 'paid') {
        verifiedRevenueKobo += o.totalKobo;
      }
      if (o.paymentStatus === 'payment_submitted' || o.paymentStatus === 'under_verification') {
        awaitingVerification += 1;
      }
      if (oStatus === 'pending') {
        pendingAckCount += 1;
      }
      if (oStatus === 'delivered') {
        completedOrders += 1;
      } else if (oStatus !== 'cancelled') {
        openOrders += 1;
      }
    }

    const lowStock = products.filter((p) => p.stockQuantity <= lowStockThreshold);
    const bestSelling = [...products]
      .sort((a, b) => (b.salesCount || 0) - (a.salesCount || 0))
      .slice(0, 5);

    return {
      verifiedRevenueKobo,
      totalOrders: filteredOrders.length,
      pendingAckCount,
      openOrders,
      awaitingVerification,
      completedOrders,
      totalCustomers: users.filter((u) => u.role === 'customer').length,
      totalProducts: products.length,
      lowStock,
      bestSelling,
    };
  }, [filteredOrders, products, users, lowStockThreshold]);

  return (
    <AdminLayout
      title="Dashboard Overview"
      actions={
        <select
          aria-label="Filter dashboard date range"
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value as any)}
          className="px-3 py-1.5 text-xs font-medium border border-slate-300 rounded-lg bg-white text-slate-800"
        >
          <option value="all">All Time</option>
          <option value="today">Last 24 Hours</option>
          <option value="7d">Last 7 Days</option>
          <option value="30d">Last 30 Days</option>
        </select>
      }
    >
      {loading ? (
        <div className="text-sm text-slate-500 py-10">Loading store analytics...</div>
      ) : (
        <div className="space-y-8">
          {/* Primary KPI Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs font-medium text-slate-500">Verified Paid Revenue</p>
              <p className="font-mono text-2xl font-bold text-[#065F46] mt-1 tabular-nums">
                {formatNaira(stats.verifiedRevenueKobo)}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">Excludes unpaid & rejected orders</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs font-medium text-slate-500">Orders Pending Acknowledgement</p>
              <p className="font-mono text-2xl font-bold text-amber-700 mt-1 tabular-nums">
                {stats.pendingAckCount}
              </p>
              <Link
                to="/admin/orders"
                className="text-[11px] text-slate-600 underline mt-1 inline-block"
              >
                {stats.awaitingVerification} awaiting payment verification
              </Link>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs font-medium text-slate-500">Orders (Total / Open / Done)</p>
              <p className="font-mono text-2xl font-bold text-slate-900 mt-1 tabular-nums">
                {stats.totalOrders}{' '}
                <span className="text-sm font-normal text-slate-500">
                  ({stats.openOrders} open · {stats.completedOrders} delivered)
                </span>
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs font-medium text-slate-500">Catalogue & Customers</p>
              <p className="font-mono text-2xl font-bold text-slate-900 mt-1 tabular-nums">
                {stats.totalProducts}{' '}
                <span className="text-sm font-normal text-slate-500">
                  products · {stats.totalCustomers} customers
                </span>
              </p>
              <p className="text-[11px] text-red-600 mt-1 tabular-nums">
                {stats.lowStock.length} low-stock alerts
              </p>
            </div>
          </div>

          {/* Recent Orders & Low Stock */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                <h2 className="font-display font-semibold text-slate-900">Recent Orders</h2>
                <Link to="/admin/orders" className="text-xs font-medium text-[#065F46] hover:underline">
                  View all
                </Link>
              </div>
              {filteredOrders.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">
                  No orders in this date window yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                      <tr>
                        <th className="py-3 px-4">Order</th>
                        <th className="py-3 px-4">Customer</th>
                        <th className="py-3 px-4">Order Status</th>
                        <th className="py-3 px-4">Payment Status</th>
                        <th className="py-3 px-4 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredOrders.slice(0, 8).map((o) => {
                        const oStatus = deriveOrderStatus(o);
                        return (
                          <tr
                            key={o.orderId}
                            className={`hover:bg-slate-50 ${
                              oStatus === 'pending' ? 'bg-amber-50/40' : ''
                            }`}
                          >
                            <td className="py-3 px-4 font-mono font-semibold">
                              <Link to={`/admin/orders/${o.orderId}`} className="text-[#065F46] hover:underline">
                                {o.orderNumber}
                              </Link>
                            </td>
                            <td className="py-3 px-4 text-slate-700">{o.customerSnapshot.fullName}</td>
                            <td className="py-3 px-4">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                                  oStatus === 'pending'
                                    ? 'bg-amber-100 text-amber-800'
                                    : oStatus === 'received' || oStatus === 'delivered'
                                      ? 'bg-emerald-100 text-[#065F46]'
                                      : 'bg-slate-100 text-slate-700'
                                }`}
                              >
                                {ORDER_STATUS_LABELS[oStatus] || oStatus}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-slate-700">
                              {PAYMENT_STATUS_LABELS[o.paymentStatus] || o.paymentStatus}
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-semibold tabular-nums">
                              {formatNaira(o.totalKobo)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                <h2 className="font-display font-semibold text-slate-900">Low-Stock Alerts</h2>
                <Link
                  to="/admin/inventory"
                  className="text-xs font-medium text-[#065F46] hover:underline"
                >
                  Manage stock
                </Link>
              </div>
              {stats.lowStock.length === 0 ? (
                <div className="p-6 text-sm text-slate-500">All products are sufficiently stocked.</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {stats.lowStock.slice(0, 6).map((p) => (
                    <div key={p.productId} className="px-5 py-3 flex items-center justify-between gap-3 text-xs">
                      <span className="font-medium text-slate-800 truncate">{p.name}</span>
                      <span
                        className={`font-mono font-bold tabular-nums shrink-0 ${
                          p.stockQuantity === 0 ? 'text-red-600' : 'text-amber-700'
                        }`}
                      >
                        {p.stockQuantity} left
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Best Sellers & Recent Customers */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              <h2 className="font-display font-semibold text-slate-900">Best-Selling Products</h2>
              <div className="divide-y divide-slate-100 text-xs">
                {stats.bestSelling.map((p) => (
                  <div key={p.productId} className="py-2.5 flex justify-between gap-4">
                    <span className="font-medium text-slate-800 truncate">{p.name}</span>
                    <span className="font-mono text-slate-600 tabular-nums shrink-0">
                      {p.salesCount || 0} sold · {formatNaira(p.priceKobo)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              <h2 className="font-display font-semibold text-slate-900">Recent Customers</h2>
              <div className="divide-y divide-slate-100 text-xs">
                {users.slice(0, 5).map((u) => (
                  <div key={u.uid} className="py-2.5 flex justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-800 truncate">{u.fullName}</p>
                      <p className="text-slate-500 truncate">{u.email}</p>
                    </div>
                    <span className="text-slate-400 shrink-0">
                      {formatLagosDateTime(u.createdAt, false)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

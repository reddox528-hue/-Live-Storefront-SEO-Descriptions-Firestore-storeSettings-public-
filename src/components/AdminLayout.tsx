import React, { useEffect, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  FolderTree,
  Percent,
  ShoppingCart,
  Landmark,
  Truck,
  Users,
  Boxes,
  MessageSquare,
  Bell,
  Settings,
  ArrowLeft,
  ShieldAlert,
  Menu,
  X,
  LogOut,
} from 'lucide-react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useStore } from '../context/StoreContext';
import { seedInitialStorefrontCatalog } from '../services/seedService';

const ADMIN_NAV = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/admin/orders', label: 'Orders', icon: ShoppingCart, badgeKey: 'pendingOrders' as const },
  { to: '/admin/payments', label: 'Bank Payments', icon: Landmark, badgeKey: 'submittedPayments' as const },
  { to: '/admin/products', label: 'Products', icon: Package },
  { to: '/admin/categories', label: 'Categories', icon: FolderTree },
  { to: '/admin/discounts', label: 'Discounts', icon: Percent },
  { to: '/admin/inventory', label: 'Inventory', icon: Boxes },
  { to: '/admin/delivery', label: 'Delivery Zones', icon: Truck },
  { to: '/admin/customers', label: 'Customers', icon: Users },
  { to: '/admin/reviews', label: 'Reviews', icon: MessageSquare },
  { to: '/admin/notifications', label: 'Notifications', icon: Bell },
  { to: '/admin/settings', label: 'Store Settings', icon: Settings },
];

export function AdminLayout({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { firebaseUser, isAdmin, authReady, logout } = useAuth();
  const { publicSettings, showToast, refreshStoreData, toasts, dismissToast } = useStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [badges, setBadges] = useState({ pendingOrders: 0, submittedPayments: 0 });
  const navigate = useNavigate();

  useEffect(() => {
    if (!authReady || !isAdmin || !firebaseUser?.emailVerified) {
      setBadges({ pendingOrders: 0, submittedPayments: 0 });
      return;
    }

    const unsubOrders = onSnapshot(
      query(collection(db, 'orders'), where('deliveryStatus', '==', 'pending')),
      (snap) => {
        const count = snap.docs.filter((d) => {
          const data = d.data();
          return (data.orderStatus || data.deliveryStatus || 'pending') === 'pending';
        }).length;
        setBadges((prev) => ({ ...prev, pendingOrders: count }));
      },
      () => {}
    );

    const unsubPayments = onSnapshot(
      query(collection(db, 'payments'), where('status', '==', 'payment_submitted')),
      (snap) => {
        setBadges((prev) => ({ ...prev, submittedPayments: snap.size }));
      },
      () => {}
    );

    return () => {
      unsubOrders();
      unsubPayments();
    };
  }, [authReady, isAdmin, firebaseUser]);

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-sm text-slate-600">
        Verifying administrator credentials...
      </div>
    );
  }

  if (!firebaseUser || !firebaseUser.emailVerified || !isAdmin) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-xl p-8 space-y-5">
          <div className="w-11 h-11 rounded-lg bg-red-50 text-red-700 flex items-center justify-center">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div className="space-y-2">
            <h1 className="font-display text-xl font-bold text-slate-900">
              Administrator Authorization Required
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              Access to the {publicSettings.storeName} admin portal is restricted to server-verified
              administrator accounts. Normal customer accounts cannot access administrative data.
            </p>
          </div>
          {firebaseUser && (
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700">
              Signed in as: <span className="font-mono font-medium">{firebaseUser.email}</span>
              {!firebaseUser.emailVerified && ' (Email unverified)'}
            </div>
          )}
          <div className="flex flex-wrap gap-3 pt-2">
            <Link
              to="/login?redirect=/admin"
              className="px-4 py-2.5 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800"
            >
              Sign in as Admin
            </Link>
            <Link
              to="/"
              className="px-4 py-2.5 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50"
            >
              Return to Store
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const handleBootstrapCatalog = async () => {
    setSeeding(true);
    try {
      const res = await seedInitialStorefrontCatalog();
      await refreshStoreData();
      if (res.seeded) {
        showToast('Initialized starter categories, products, discounts, and Nigerian delivery zones.');
      } else {
        showToast('Catalog already contains categories.', 'info');
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to initialize starter catalog.', 'error');
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-slate-950 text-slate-200 flex flex-col transition-transform duration-200 lg:static lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-16 px-5 flex items-center justify-between border-b border-slate-800">
          <Link to="/admin" className="font-display font-bold text-white tracking-tight truncate">
            {publicSettings.storeName} Admin
          </Link>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1 text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {ADMIN_NAV.map((item) => {
            const Icon = item.icon;
            const badgeCount = item.badgeKey ? badges[item.badgeKey] : 0;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  `flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-[#065F46] text-white'
                      : 'text-slate-400 hover:text-white hover:bg-slate-900'
                  }`
                }
              >
                <span className="flex items-center gap-3 min-w-0">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </span>
                {badgeCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-400 text-slate-950 leading-none">
                    {badgeCount}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800 space-y-2.5">
          <button
            type="button"
            onClick={handleBootstrapCatalog}
            disabled={seeding}
            className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs font-medium text-slate-200 hover:bg-slate-800 cursor-pointer disabled:opacity-60"
          >
            {seeding ? 'Initializing...' : 'Initialize Starter Catalog'}
          </button>
          <Link
            to="/"
            className="flex items-center gap-2 px-3 py-2 text-xs text-slate-400 hover:text-white"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>View Customer Storefront</span>
          </Link>
          <button
            type="button"
            onClick={async () => {
              await logout();
              navigate('/');
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:text-red-300 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out ({firebaseUser.email})</span>
          </button>
        </div>
      </aside>

      {/* Main Workspace */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open admin sidebar"
              className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-slate-900"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm text-slate-500 truncate">
              <span className="hidden sm:inline">Admin</span>
              <span className="hidden sm:inline">/</span>
              <h1 className="font-display font-semibold text-slate-900 text-base sm:text-lg truncate">
                {title}
              </h1>
            </div>
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">{children}</main>
      </div>

      {/* Admin Toast Stack */}
      {toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full px-4 sm:px-0">
          {toasts.map((t) => (
            <div
              key={t.id}
              className="flex items-start justify-between gap-3 p-3.5 rounded-xl bg-slate-900 text-white shadow-lg border border-slate-700 text-sm"
            >
              <span>{t.text}</span>
              <button
                type="button"
                onClick={() => dismissToast(t.id)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

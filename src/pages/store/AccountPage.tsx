import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { User, Package, MapPin, Bell, Lock, LogOut, Trash2, Plus, Search } from 'lucide-react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { StoreLayout } from '../../components/StoreLayout';
import { SEOHead } from '../../components/SEOHead';
import { useAuth } from '../../context/AuthContext';
import { useStore } from '../../context/StoreContext';
import { db } from '../../firebase';
import { Order, SavedAddress } from '../../types/ecommerce';
import {
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  deriveOrderStatus,
  formatLagosDateTime,
  formatNaira,
} from '../../utils/nigerianCurrency';
import { NIGERIAN_STATES } from '../../utils/nigeriaLocations';
import {
  deleteAddress,
  fetchCustomerAddresses,
  generateId,
  upsertAddress,
} from '../../services/storefrontService';

export function AccountPage() {
  const {
    firebaseUser,
    userProfile,
    authReady,
    updateCustomerProfile,
    changeCustomerPassword,
    logout,
  } = useAuth();
  const { publicSettings, notifications, markNotificationAsRead, showToast } = useStore();
  const location = useLocation();
  const navigate = useNavigate();

  const initialTab = location.pathname.includes('/orders')
    ? 'orders'
    : location.pathname.includes('/addresses')
      ? 'addresses'
      : 'overview';

  const [tab, setTab] = useState<'overview' | 'orders' | 'addresses' | 'notifications' | 'security'>(
    initialTab
  );
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderSearch, setOrderSearch] = useState('');
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // Profile edit state
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [changingPass, setChangingPass] = useState(false);

  // Address form state
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [addrFullName, setAddrFullName] = useState('');
  const [addrPhone, setAddrPhone] = useState('');
  const [addrState, setAddrState] = useState('Lagos');
  const [addrLga, setAddrLga] = useState('');
  const [addrCity, setAddrCity] = useState('');
  const [addrStreet, setAddrStreet] = useState('');

  useEffect(() => {
    if (location.pathname.includes('/orders')) setTab('orders');
    else if (location.pathname.includes('/addresses')) setTab('addresses');
  }, [location.pathname]);

  useEffect(() => {
    if (userProfile) {
      setFullName(userProfile.fullName || '');
      setPhone(userProfile.phone || '');
    }
  }, [userProfile]);

  useEffect(() => {
    if (!authReady) return;
    if (!firebaseUser || !firebaseUser.emailVerified) {
      setLoadingData(false);
      return;
    }
    setLoadingData(true);

    fetchCustomerAddresses(firebaseUser.uid)
      .then(setAddresses)
      .catch(() => {});

    const unsubOrders = onSnapshot(
      query(collection(db, 'orders'), where('customerId', '==', firebaseUser.uid)),
      (snap) => {
        setOrders(
          snap.docs
            .map((d) => d.data() as Order)
            .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
        );
        setLoadingData(false);
      },
      () => {
        setLoadingData(false);
      }
    );

    return () => unsubOrders();
  }, [authReady, firebaseUser]);

  if (!authReady) {
    return (
      <StoreLayout>
        <div className="max-w-5xl mx-auto px-4 py-16 text-sm text-zinc-500">
          Loading account...
        </div>
      </StoreLayout>
    );
  }

  if (!firebaseUser || !firebaseUser.emailVerified) {
    return (
      <StoreLayout>
        <div className="max-w-md mx-auto px-4 py-16 text-center space-y-4">
          <h1 className="font-display text-2xl font-bold text-zinc-900">Account Access</h1>
          <p className="text-sm text-zinc-600">
            Please sign in with a verified account to view your orders and saved addresses.
          </p>
          <Link
            to="/login?redirect=/account"
            className="inline-block px-6 py-3 rounded-xl bg-zinc-900 text-white text-sm font-semibold"
          >
            Sign In
          </Link>
        </div>
      </StoreLayout>
    );
  }

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await updateCustomerProfile(fullName, phone);
      showToast('Profile updated.');
    } catch (err: any) {
      showToast(err?.message || 'Failed to update profile.', 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleAddAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const addressId = generateId('addr');
      await upsertAddress(
        {
          addressId,
          customerId: firebaseUser.uid,
          fullName: addrFullName.trim(),
          phone: addrPhone.trim(),
          state: addrState,
          lga: addrLga.trim(),
          city: addrCity.trim(),
          streetAddress: addrStreet.trim(),
          additionalInstructions: '',
          isDefault: addresses.length === 0,
        },
        true
      );
      const updated = await fetchCustomerAddresses(firebaseUser.uid);
      setAddresses(updated);
      setShowAddressForm(false);
      setAddrFullName('');
      setAddrPhone('');
      setAddrLga('');
      setAddrCity('');
      setAddrStreet('');
      showToast('Delivery address saved.');
    } catch (err: any) {
      showToast(err?.message || 'Could not save address.', 'error');
    }
  };

  const handleDeleteAddress = async (addressId: string) => {
    try {
      await deleteAddress(addressId);
      setAddresses((prev) => prev.filter((a) => a.addressId !== addressId));
      showToast('Address removed.');
    } catch (err: any) {
      showToast(err?.message || 'Failed to delete address.', 'error');
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setChangingPass(true);
    try {
      await changeCustomerPassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      showToast('Password updated successfully.');
    } catch (err: any) {
      showToast(err?.message || 'Unable to change password. Re-check current password.', 'error');
    } finally {
      setChangingPass(false);
    }
  };

  const isPasswordProvider = firebaseUser.providerData.some((p) => p.providerId === 'password');

  return (
    <StoreLayout>
      <SEOHead
        title={`My Account – ${publicSettings.storeName}`}
        description="Manage your orders, bank-transfer receipts, saved addresses, and profile."
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="font-display text-3xl font-bold text-zinc-900">My Account</h1>
            <p className="text-sm text-zinc-600 mt-1">{firebaseUser.email}</p>
          </div>
          <button
            type="button"
            onClick={async () => {
              await logout();
              navigate('/');
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-zinc-300 text-sm font-medium text-zinc-700 hover:bg-zinc-50 self-start cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Sidebar Tabs */}
          <aside className="lg:col-span-3 bg-white border border-zinc-200/80 rounded-2xl p-3 space-y-1">
            {[
              { id: 'overview', label: 'Profile & Overview', icon: User },
              { id: 'orders', label: `My Orders (${orders.length})`, icon: Package },
              { id: 'addresses', label: `Saved Addresses (${addresses.length})`, icon: MapPin },
              { id: 'notifications', label: `Notifications (${notifications.filter((n) => !n.isRead).length})`, icon: Bell },
              { id: 'security', label: 'Password & Security', icon: Lock },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id as any)}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium cursor-pointer transition-colors ${
                    tab === item.id
                      ? 'bg-zinc-900 text-white'
                      : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </aside>

          {/* Main Tab Content */}
          <div className="lg:col-span-9 space-y-6">
            {tab === 'overview' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-white border border-zinc-200/80 rounded-xl p-5">
                    <p className="text-xs text-zinc-500">Total Orders</p>
                    <p className="font-mono text-2xl font-bold text-zinc-900 mt-1 tabular-nums">
                      {orders.length}
                    </p>
                  </div>
                  <div className="bg-white border border-zinc-200/80 rounded-xl p-5">
                    <p className="text-xs text-zinc-500">Awaiting Payment Action</p>
                    <p className="font-mono text-2xl font-bold text-amber-700 mt-1 tabular-nums">
                      {orders.filter((o) => o.paymentStatus === 'awaiting_payment').length}
                    </p>
                  </div>
                  <div className="bg-white border border-zinc-200/80 rounded-xl p-5">
                    <p className="text-xs text-zinc-500">Saved Addresses</p>
                    <p className="font-mono text-2xl font-bold text-zinc-900 mt-1 tabular-nums">
                      {addresses.length}
                    </p>
                  </div>
                </div>

                <form
                  onSubmit={handleSaveProfile}
                  className="bg-white border border-zinc-200/80 rounded-2xl p-6 space-y-4"
                >
                  <h2 className="font-display text-lg font-bold text-zinc-900">
                    Personal Information
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-zinc-700 mb-1.5">
                        Full Name
                      </label>
                      <input
                        type="text"
                        required
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="w-full px-3.5 py-2.5 text-sm border border-zinc-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-700 mb-1.5">
                        Phone Number
                      </label>
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+234 800 000 0000"
                        className="w-full px-3.5 py-2.5 text-sm border border-zinc-300 rounded-lg"
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={savingProfile}
                    className="px-5 py-2.5 rounded-xl bg-zinc-900 text-white text-sm font-semibold hover:bg-[#065F46] cursor-pointer disabled:opacity-60"
                  >
                    {savingProfile ? 'Saving...' : 'Save Changes'}
                  </button>
                </form>
              </div>
            )}

            {tab === 'orders' && (
              <div className="bg-white border border-zinc-200/80 rounded-2xl overflow-hidden">
                <div className="p-6 border-b border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="font-display text-lg font-bold text-zinc-900">Order History</h2>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      Real-time status tracking for all your orders
                    </p>
                  </div>
                  <div className="relative w-full sm:w-64">
                    <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="search"
                      value={orderSearch}
                      onChange={(e) => setOrderSearch(e.target.value)}
                      placeholder="Search by Order # (ORD-...)"
                      className="w-full pl-8 pr-3 py-2 text-xs border border-zinc-300 rounded-lg font-mono"
                    />
                  </div>
                </div>
                {loadingData ? (
                  <div className="p-6 text-sm text-zinc-500">Loading orders...</div>
                ) : orders.length === 0 ? (
                  <div className="p-10 text-center space-y-3">
                    <p className="text-sm text-zinc-600">You have not placed any orders yet.</p>
                    <Link
                      to="/shop"
                      className="inline-block px-5 py-2.5 rounded-xl bg-zinc-900 text-white text-sm font-medium"
                    >
                      Explore Products
                    </Link>
                  </div>
                ) : (
                  <div className="divide-y divide-zinc-100">
                    {orders
                      .filter((ord) => {
                        const q = orderSearch.trim().toLowerCase();
                        if (!q) return true;
                        const itemsText = ord.items.map((i) => i.productName).join(' ').toLowerCase();
                        return ord.orderNumber.toLowerCase().includes(q) || itemsText.includes(q);
                      })
                      .map((ord) => {
                        const oStatus = deriveOrderStatus(ord);
                        return (
                          <div
                            key={ord.orderId}
                            className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-zinc-50/70"
                          >
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-2.5 flex-wrap">
                                <span className="font-mono font-bold text-zinc-900">
                                  {ord.orderNumber}
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                                    oStatus === 'pending'
                                      ? 'bg-amber-50 text-amber-800 border-amber-200'
                                      : oStatus === 'received' || oStatus === 'delivered'
                                        ? 'bg-emerald-50 text-[#065F46] border-emerald-200'
                                        : oStatus === 'cancelled'
                                          ? 'bg-red-50 text-red-800 border-red-200'
                                          : 'bg-sky-50 text-sky-800 border-sky-200'
                                  }`}
                                >
                                  Order: {ORDER_STATUS_LABELS[oStatus] || oStatus}
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                                    ord.paymentStatus === 'paid'
                                      ? 'bg-emerald-50 text-[#065F46] border-emerald-200'
                                      : ord.paymentStatus === 'payment_rejected'
                                        ? 'bg-red-50 text-red-800 border-red-200'
                                        : 'bg-zinc-100 text-zinc-700 border-zinc-200'
                                  }`}
                                >
                                  Payment: {PAYMENT_STATUS_LABELS[ord.paymentStatus] || ord.paymentStatus}
                                </span>
                              </div>
                              <p className="text-xs text-zinc-500">
                                Placed {formatLagosDateTime(ord.createdAt)} (WAT) · {ord.items.length}{' '}
                                {ord.items.length === 1 ? 'item' : 'items'}
                              </p>
                            </div>

                            <div className="flex items-center gap-4">
                              <span className="font-mono font-bold text-zinc-900 tabular-nums">
                                {formatNaira(ord.totalKobo)}
                              </span>
                              <Link
                                to={`/account/orders/${ord.orderId}`}
                                className="px-4 py-2 rounded-lg border border-zinc-300 text-xs font-semibold text-zinc-900 hover:bg-zinc-900 hover:text-white transition-colors whitespace-nowrap"
                              >
                                {ord.paymentStatus === 'awaiting_payment' ||
                                ord.paymentStatus === 'payment_rejected'
                                  ? 'Pay / Upload Receipt'
                                  : 'Track Order'}
                              </Link>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            )}

            {tab === 'addresses' && (
              <div className="bg-white border border-zinc-200/80 rounded-2xl p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-lg font-bold text-zinc-900">
                    Saved Delivery Addresses
                  </h2>
                  <button
                    type="button"
                    onClick={() => setShowAddressForm((v) => !v)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-zinc-900 text-white text-xs font-semibold cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Address</span>
                  </button>
                </div>

                {showAddressForm && (
                  <form
                    onSubmit={handleAddAddress}
                    className="p-5 rounded-xl bg-zinc-50 border border-zinc-200 space-y-4"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input
                        type="text"
                        required
                        placeholder="Recipient Full Name"
                        value={addrFullName}
                        onChange={(e) => setAddrFullName(e.target.value)}
                        className="px-3 py-2 text-sm border border-zinc-300 rounded-lg bg-white"
                      />
                      <input
                        type="tel"
                        required
                        placeholder="Phone (+234...)"
                        value={addrPhone}
                        onChange={(e) => setAddrPhone(e.target.value)}
                        className="px-3 py-2 text-sm border border-zinc-300 rounded-lg bg-white"
                      />
                      <select
                        value={addrState}
                        onChange={(e) => setAddrState(e.target.value)}
                        className="px-3 py-2 text-sm border border-zinc-300 rounded-lg bg-white"
                      >
                        {NIGERIAN_STATES.map((st) => (
                          <option key={st} value={st}>
                            {st}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        required
                        placeholder="LGA"
                        value={addrLga}
                        onChange={(e) => setAddrLga(e.target.value)}
                        className="px-3 py-2 text-sm border border-zinc-300 rounded-lg bg-white"
                      />
                      <input
                        type="text"
                        required
                        placeholder="City / Town"
                        value={addrCity}
                        onChange={(e) => setAddrCity(e.target.value)}
                        className="px-3 py-2 text-sm border border-zinc-300 rounded-lg bg-white"
                      />
                      <input
                        type="text"
                        required
                        placeholder="Street Address"
                        value={addrStreet}
                        onChange={(e) => setAddrStreet(e.target.value)}
                        className="px-3 py-2 text-sm border border-zinc-300 rounded-lg bg-white"
                      />
                    </div>
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-lg bg-[#065F46] text-white text-xs font-semibold cursor-pointer"
                    >
                      Save Address
                    </button>
                  </form>
                )}

                {addresses.length === 0 ? (
                  <p className="text-sm text-zinc-500">No saved delivery addresses yet.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {addresses.map((addr) => (
                      <div
                        key={addr.addressId}
                        className="p-4 rounded-xl border border-zinc-200 flex justify-between items-start gap-3"
                      >
                        <div className="text-xs space-y-1">
                          <p className="font-semibold text-sm text-zinc-900">{addr.fullName}</p>
                          <p className="text-zinc-600">{addr.streetAddress}</p>
                          <p className="text-zinc-500">
                            {addr.city}, {addr.lga}, {addr.state}
                          </p>
                          <p className="font-mono text-zinc-600">{addr.phone}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteAddress(addr.addressId)}
                          aria-label="Delete address"
                          className="p-1.5 text-zinc-400 hover:text-red-600 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {tab === 'notifications' && (
              <div className="bg-white border border-zinc-200/80 rounded-2xl p-6 space-y-4">
                <h2 className="font-display text-lg font-bold text-zinc-900">Notifications</h2>
                {notifications.length === 0 ? (
                  <p className="text-sm text-zinc-500">No notifications yet.</p>
                ) : (
                  <div className="divide-y divide-zinc-100">
                    {notifications.map((n) => (
                      <div
                        key={n.notificationId}
                        className={`py-3.5 flex items-start justify-between gap-4 ${
                          n.isRead ? 'opacity-70' : ''
                        }`}
                      >
                        <div className="space-y-0.5">
                          <p className="text-sm font-semibold text-zinc-900">{n.title}</p>
                          <p className="text-xs text-zinc-600">{n.message}</p>
                          <p className="text-[11px] text-zinc-400">
                            {formatLagosDateTime(n.createdAt)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {n.relatedOrderId && (
                            <Link
                              to={`/account/orders/${n.relatedOrderId}`}
                              className="text-xs font-medium text-[#065F46] hover:underline"
                            >
                              View Order
                            </Link>
                          )}
                          {!n.isRead && (
                            <button
                              type="button"
                              onClick={() => markNotificationAsRead(n.notificationId)}
                              className="text-xs text-zinc-500 hover:text-zinc-900 cursor-pointer"
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

            {tab === 'security' && (
              <div className="bg-white border border-zinc-200/80 rounded-2xl p-6 space-y-4">
                <h2 className="font-display text-lg font-bold text-zinc-900">Password & Security</h2>
                {isPasswordProvider ? (
                  <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
                    <div>
                      <label className="block text-xs font-medium text-zinc-700 mb-1.5">
                        Current Password
                      </label>
                      <input
                        type="password"
                        required
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        className="w-full px-3.5 py-2.5 text-sm border border-zinc-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-700 mb-1.5">
                        New Password
                      </label>
                      <input
                        type="password"
                        required
                        minLength={6}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full px-3.5 py-2.5 text-sm border border-zinc-300 rounded-lg"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={changingPass}
                      className="px-5 py-2.5 rounded-xl bg-zinc-900 text-white text-sm font-semibold hover:bg-[#065F46] cursor-pointer"
                    >
                      {changingPass ? 'Updating...' : 'Update Password'}
                    </button>
                  </form>
                ) : (
                  <p className="text-sm text-zinc-600">
                    Your account is authenticated via Google Sign-In. Password management is handled
                    directly through your Google Account security settings.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </StoreLayout>
  );
}

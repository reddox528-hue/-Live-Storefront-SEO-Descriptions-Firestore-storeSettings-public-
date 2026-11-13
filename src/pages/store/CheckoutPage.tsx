import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Landmark, MapPin, ShieldCheck, AlertCircle, CheckCircle2 } from 'lucide-react';
import { StoreLayout } from '../../components/StoreLayout';
import { SEOHead } from '../../components/SEOHead';
import { useAuth } from '../../context/AuthContext';
import { useStore } from '../../context/StoreContext';
import { SavedAddress, StoreBankSettings } from '../../types/ecommerce';
import { computeProductPricing, formatNaira } from '../../utils/nigerianCurrency';
import { COMMON_LGAS_BY_STATE, NIGERIAN_STATES } from '../../utils/nigeriaLocations';
import {
  fetchBankSettings,
  fetchCustomerAddresses,
  generateId,
  matchDeliveryZone,
  placeBankTransferOrder,
  upsertAddress,
} from '../../services/storefrontService';

export function CheckoutPage() {
  const { firebaseUser, userProfile, authReady } = useAuth();
  const {
    publicSettings,
    cart,
    products,
    discounts,
    deliveryZones,
    cartSubtotalKobo,
    cartDiscountTotalKobo,
    cartNetSubtotalKobo,
    clearCart,
    showToast,
  } = useStore();
  const navigate = useNavigate();

  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string>('new');
  const [bankSettings, setBankSettings] = useState<StoreBankSettings | null>(null);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [stateName, setStateName] = useState('Lagos');
  const [lga, setLga] = useState('Eti-Osa');
  const [city, setCity] = useState('Lekki');
  const [streetAddress, setStreetAddress] = useState('');
  const [deliveryInstructions, setDeliveryInstructions] = useState('');
  const [saveThisAddress, setSaveThisAddress] = useState(true);
  const [confirmChecked, setConfirmChecked] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [idempotencyKey] = useState(() => generateId('idem'));

  useEffect(() => {
    if (userProfile) {
      setFullName((prev) => prev || userProfile.fullName || '');
      setEmail((prev) => prev || userProfile.email || '');
      setPhone((prev) => prev || userProfile.phone || '');
    } else if (firebaseUser) {
      setFullName((prev) => prev || firebaseUser.displayName || '');
      setEmail((prev) => prev || firebaseUser.email || '');
    }
  }, [userProfile, firebaseUser]);

  useEffect(() => {
    if (!firebaseUser || !firebaseUser.emailVerified) return;
    Promise.all([fetchCustomerAddresses(firebaseUser.uid), fetchBankSettings()])
      .then(([addrs, bank]) => {
        setSavedAddresses(addrs);
        setBankSettings(bank);
        const def = addrs.find((a) => a.isDefault) || addrs[0];
        if (def) {
          setSelectedAddressId(def.addressId);
          setFullName(def.fullName);
          setPhone(def.phone);
          setStateName(def.state);
          setLga(def.lga);
          setCity(def.city);
          setStreetAddress(def.streetAddress);
          setDeliveryInstructions(def.additionalInstructions || '');
        }
      })
      .catch(() => {});
  }, [firebaseUser]);

  const matchedZone = useMemo(
    () => matchDeliveryZone(deliveryZones, stateName, city),
    [deliveryZones, stateName, city]
  );

  const deliveryFeeKobo = useMemo(() => {
    if (!matchedZone) return 0;
    const freeThreshold = matchedZone.freeDeliveryThresholdKobo || 0;
    if (freeThreshold > 0 && cartNetSubtotalKobo >= freeThreshold) return 0;
    return matchedZone.deliveryFeeKobo;
  }, [matchedZone, cartNetSubtotalKobo]);

  const totalKobo = cartNetSubtotalKobo + deliveryFeeKobo;

  const handleSelectSavedAddress = (addrId: string) => {
    setSelectedAddressId(addrId);
    if (addrId === 'new') return;
    const found = savedAddresses.find((a) => a.addressId === addrId);
    if (found) {
      setFullName(found.fullName);
      setPhone(found.phone);
      setStateName(found.state);
      setLga(found.lga);
      setCity(found.city);
      setStreetAddress(found.streetAddress);
      setDeliveryInstructions(found.additionalInstructions || '');
    }
  };

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!firebaseUser || !firebaseUser.emailVerified) {
      setErrorMsg('Please sign in with a verified email account to place an order.');
      return;
    }
    if (!matchedZone) {
      setErrorMsg(
        `Delivery is not currently enabled for ${stateName}${city ? ` (${city})` : ''}. Please choose a supported Nigerian delivery zone.`
      );
      return;
    }
    if (!confirmChecked) {
      setErrorMsg('Please confirm your order details and bank-transfer terms before submitting.');
      return;
    }
    if (cart.length === 0) {
      setErrorMsg('Your cart is empty.');
      return;
    }

    setSubmitting(true);
    try {
      if (selectedAddressId === 'new' && saveThisAddress) {
        const addressId = generateId('addr');
        await upsertAddress(
          {
            addressId,
            customerId: firebaseUser.uid,
            fullName: fullName.trim(),
            phone: phone.trim(),
            state: stateName.trim(),
            lga: lga.trim(),
            city: city.trim(),
            streetAddress: streetAddress.trim(),
            additionalInstructions: deliveryInstructions.trim(),
            isDefault: savedAddresses.length === 0,
          },
          true
        ).catch(() => {});
      }

      const result = await placeBankTransferOrder({
        customerId: firebaseUser.uid,
        items: cart,
        customerSnapshot: {
          fullName: fullName.trim(),
          email: email.trim(),
          phone: phone.trim(),
        },
        deliveryAddress: {
          fullName: fullName.trim(),
          phone: phone.trim(),
          state: stateName.trim(),
          lga: lga.trim(),
          city: city.trim(),
          streetAddress: streetAddress.trim(),
        },
        deliveryInstructions: deliveryInstructions.trim(),
        idempotencyKey,
      });

      clearCart();
      showToast(`Order ${result.orderNumber} submitted! Complete your bank transfer below.`);
      navigate(`/account/orders/${result.orderId}?created=1`);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to create order. Please verify stock and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!authReady) {
    return (
      <StoreLayout>
        <div className="max-w-4xl mx-auto px-4 py-16 text-sm text-zinc-500">
          Loading checkout...
        </div>
      </StoreLayout>
    );
  }

  if (!firebaseUser || !firebaseUser.emailVerified) {
    return (
      <StoreLayout>
        <SEOHead
          title={`Checkout – ${publicSettings.storeName}`}
          description="Sign in to complete your Nigerian bank-transfer order."
        />
        <div className="max-w-lg mx-auto px-4 py-16">
          <div className="bg-white border border-zinc-200 rounded-2xl p-8 text-center space-y-5">
            <ShieldCheck className="w-10 h-10 text-[#065F46] mx-auto" />
            <h1 className="font-display text-2xl font-bold text-zinc-900">
              {firebaseUser ? 'Verify Your Email to Checkout' : 'Sign In to Checkout'}
            </h1>
            <p className="text-sm text-zinc-600 leading-relaxed">
              {firebaseUser
                ? 'Please verify your email address before placing an order and accessing your private order tracking dashboard.'
                : 'Sign in or create a customer account to save delivery addresses, place orders, and upload bank-transfer receipts securely.'}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
              <Link
                to="/login?redirect=/checkout"
                className="px-6 py-3 rounded-xl bg-zinc-900 text-white text-sm font-semibold hover:bg-[#065F46]"
              >
                {firebaseUser ? 'Check Verification Status' : 'Sign In'}
              </Link>
              {!firebaseUser && (
                <Link
                  to="/register?redirect=/checkout"
                  className="px-6 py-3 rounded-xl border border-zinc-300 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
                >
                  Create Account
                </Link>
              )}
            </div>
          </div>
        </div>
      </StoreLayout>
    );
  }

  const lgaSuggestions = COMMON_LGAS_BY_STATE[stateName] || [];

  return (
    <StoreLayout>
      <SEOHead
        title={`Checkout – ${publicSettings.storeName}`}
        description="Complete your delivery details and confirm your Nigerian Naira bank-transfer order."
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <h1 className="font-display text-3xl font-bold text-zinc-900 mb-8">Checkout</h1>

        {cart.length === 0 ? (
          <div className="bg-white border border-zinc-200 rounded-2xl p-10 text-center space-y-4">
            <p className="text-sm text-zinc-600">Your shopping cart is empty.</p>
            <Link
              to="/shop"
              className="inline-block px-5 py-2.5 rounded-xl bg-zinc-900 text-white text-sm font-medium"
            >
              Return to Shop
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmitOrder} className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-7 space-y-6">
              {/* Saved Addresses */}
              {savedAddresses.length > 0 && (
                <div className="bg-white border border-zinc-200/80 rounded-2xl p-6 space-y-4">
                  <h2 className="font-display text-lg font-bold text-zinc-900 flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-[#065F46]" />
                    <span>Saved Delivery Addresses</span>
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {savedAddresses.map((addr) => (
                      <button
                        key={addr.addressId}
                        type="button"
                        onClick={() => handleSelectSavedAddress(addr.addressId)}
                        className={`text-left p-4 rounded-xl border text-xs space-y-1 cursor-pointer transition-colors ${
                          selectedAddressId === addr.addressId
                            ? 'border-[#065F46] bg-[#065F46]/5'
                            : 'border-zinc-200 hover:border-zinc-400'
                        }`}
                      >
                        <p className="font-semibold text-sm text-zinc-900">{addr.fullName}</p>
                        <p className="text-zinc-600">{addr.streetAddress}</p>
                        <p className="text-zinc-500">
                          {addr.city}, {addr.lga}, {addr.state}
                        </p>
                        <p className="font-mono text-zinc-600">{addr.phone}</p>
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => handleSelectSavedAddress('new')}
                      className={`text-left p-4 rounded-xl border text-sm font-medium flex items-center justify-center cursor-pointer ${
                        selectedAddressId === 'new'
                          ? 'border-[#065F46] bg-[#065F46]/5 text-[#065F46]'
                          : 'border-dashed border-zinc-300 text-zinc-600 hover:border-zinc-500'
                      }`}
                    >
                      + Enter a New Delivery Address
                    </button>
                  </div>
                </div>
              )}

              {/* Customer & Nigerian Address Form */}
              <div className="bg-white border border-zinc-200/80 rounded-2xl p-6 space-y-5">
                <h2 className="font-display text-lg font-bold text-zinc-900">
                  Delivery Information (Nigeria)
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 mb-1.5">
                      Full Name *
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
                      Email Address *
                    </label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm border border-zinc-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 mb-1.5">
                      Phone Number (Nigeria) *
                    </label>
                    <input
                      type="tel"
                      required
                      placeholder="+234 800 000 0000"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm border border-zinc-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 mb-1.5">
                      State *
                    </label>
                    <select
                      required
                      value={stateName}
                      onChange={(e) => {
                        setStateName(e.target.value);
                        setSelectedAddressId('new');
                      }}
                      className="w-full px-3.5 py-2.5 text-sm border border-zinc-300 rounded-lg bg-white"
                    >
                      {NIGERIAN_STATES.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 mb-1.5">
                      Local Government Area (LGA) *
                    </label>
                    <input
                      type="text"
                      required
                      list="lga-options"
                      value={lga}
                      onChange={(e) => setLga(e.target.value)}
                      placeholder="e.g. Eti-Osa, Ikeja, AMAC"
                      className="w-full px-3.5 py-2.5 text-sm border border-zinc-300 rounded-lg"
                    />
                    <datalist id="lga-options">
                      {lgaSuggestions.map((item) => (
                        <option key={item} value={item} />
                      ))}
                    </datalist>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 mb-1.5">
                      City / Town *
                    </label>
                    <input
                      type="text"
                      required
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="e.g. Lekki, Wuse II, Ikeja"
                      className="w-full px-3.5 py-2.5 text-sm border border-zinc-300 rounded-lg"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-700 mb-1.5">
                    Street Address *
                  </label>
                  <input
                    type="text"
                    required
                    value={streetAddress}
                    onChange={(e) => setStreetAddress(e.target.value)}
                    placeholder="House number, street name, estate or landmark"
                    className="w-full px-3.5 py-2.5 text-sm border border-zinc-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-700 mb-1.5">
                    Additional Delivery Instructions
                  </label>
                  <textarea
                    rows={2}
                    value={deliveryInstructions}
                    onChange={(e) => setDeliveryInstructions(e.target.value)}
                    placeholder="Gate code, nearest bus stop, preferred delivery window..."
                    className="w-full px-3.5 py-2.5 text-sm border border-zinc-300 rounded-lg"
                  />
                </div>

                {selectedAddressId === 'new' && (
                  <label className="inline-flex items-center gap-2 text-xs text-zinc-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={saveThisAddress}
                      onChange={(e) => setSaveThisAddress(e.target.checked)}
                    />
                    <span>Save this address to my account</span>
                  </label>
                )}
              </div>

              {/* Payment Method: Bank Transfer Only */}
              <div className="bg-white border border-zinc-200/80 rounded-2xl p-6 space-y-4">
                <div className="flex items-center gap-2.5">
                  <Landmark className="w-5 h-5 text-[#065F46]" />
                  <h2 className="font-display text-lg font-bold text-zinc-900">
                    Payment Method: Nigerian Bank Transfer Only
                  </h2>
                </div>
                <p className="text-sm text-zinc-600 leading-relaxed">
                  Once you confirm your order, you will receive your unique Order Number and our
                  verified bank account details below. Transfer the exact Naira amount and upload
                  your payment receipt for admin verification.
                </p>

                {bankSettings && (
                  <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200 text-sm space-y-1.5">
                    <p>
                      <span className="text-zinc-500">Bank Name:</span>{' '}
                      <strong className="text-zinc-900">{bankSettings.bankName}</strong>
                    </p>
                    <p>
                      <span className="text-zinc-500">Account Name:</span>{' '}
                      <strong className="text-zinc-900">{bankSettings.accountName}</strong>
                    </p>
                    <p>
                      <span className="text-zinc-500">Account Number:</span>{' '}
                      <strong className="font-mono text-zinc-900">{bankSettings.accountNumber}</strong>
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Checkout Order Summary */}
            <div className="lg:col-span-5 bg-white border border-zinc-200/80 rounded-2xl p-6 space-y-5 lg:sticky lg:top-24">
              <h2 className="font-display text-lg font-bold text-zinc-900">Review Order</h2>

              <div className="divide-y divide-zinc-100 max-h-72 overflow-y-auto pr-1">
                {cart.map((item, idx) => {
                  const prod = products.find((p) => p.productId === item.productId);
                  if (!prod) return null;
                  const pricing = computeProductPricing(prod, discounts);
                  return (
                    <div key={`${item.productId}_${idx}`} className="py-3 flex justify-between gap-3 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium text-zinc-900 truncate">{prod.name}</p>
                        <p className="text-xs text-zinc-500">Qty: {item.quantity}</p>
                      </div>
                      <span className="font-mono font-medium text-zinc-900 tabular-nums shrink-0">
                        {formatNaira(pricing.finalPriceKobo * item.quantity)}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="border-t border-zinc-200 pt-4 space-y-2.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-zinc-600">Subtotal</span>
                  <span className="font-mono tabular-nums">{formatNaira(cartSubtotalKobo)}</span>
                </div>
                {cartDiscountTotalKobo > 0 && (
                  <div className="flex justify-between text-[#065F46]">
                    <span>Discounts</span>
                    <span className="font-mono tabular-nums">
                      -{formatNaira(cartDiscountTotalKobo)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-start gap-3">
                  <div>
                    <span className="text-zinc-600">Delivery ({stateName})</span>
                    {matchedZone && (
                      <p className="text-xs text-zinc-400">
                        {matchedZone.name} · {matchedZone.estimatedDeliveryDays}
                      </p>
                    )}
                  </div>
                  <span className="font-mono tabular-nums font-medium">
                    {matchedZone
                      ? deliveryFeeKobo === 0
                        ? 'Free'
                        : formatNaira(deliveryFeeKobo)
                      : 'Unavailable'}
                  </span>
                </div>
              </div>

              {!matchedZone && (
                <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    Delivery is not yet enabled for <strong>{stateName}</strong>. Please choose a
                    supported state or contact our store desk to request coverage.
                  </span>
                </div>
              )}

              <div className="border-t border-zinc-200 pt-4 flex justify-between items-baseline">
                <span className="font-semibold text-zinc-900">Amount Payable</span>
                <span className="font-mono text-2xl font-bold text-zinc-900 tabular-nums">
                  {formatNaira(totalKobo)}
                </span>
              </div>

              <label className="flex items-start gap-2.5 text-xs text-zinc-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={confirmChecked}
                  onChange={(e) => setConfirmChecked(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  I confirm my order items and delivery address, and understand my order will be
                  dispatched after bank-transfer payment is verified by the store administrator.
                </span>
              </label>

              {errorMsg && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
                  {errorMsg}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || !matchedZone || !confirmChecked}
                className="w-full py-3.5 px-5 rounded-xl bg-[#065F46] text-white text-sm font-semibold hover:bg-[#047857] disabled:bg-zinc-200 disabled:text-zinc-500 transition-colors cursor-pointer disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{submitting ? 'Submitting Order...' : 'Confirm & Place Order'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </StoreLayout>
  );
}

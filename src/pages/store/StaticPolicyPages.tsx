import React from 'react';
import { StoreLayout } from '../../components/StoreLayout';
import { SEOHead } from '../../components/SEOHead';
import { useStore } from '../../context/StoreContext';
import { formatNaira } from '../../utils/nigerianCurrency';

function PolicyShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  const { publicSettings } = useStore();
  return (
    <StoreLayout>
      <SEOHead title={`${title} – ${publicSettings.storeName}`} description={description} />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-white border border-zinc-200/80 rounded-2xl p-8 sm:p-10 space-y-6">
          <h1 className="font-display text-3xl font-bold text-zinc-900">{title}</h1>
          <div className="text-sm sm:text-base text-zinc-700 leading-relaxed space-y-4 whitespace-pre-line">
            {children}
          </div>
        </div>
      </div>
    </StoreLayout>
  );
}

export function AboutPage() {
  const { publicSettings } = useStore();
  return (
    <PolicyShell title={`About ${publicSettings.storeName}`} description={publicSettings.storeDescription}>
      <p>{publicSettings.policies.aboutUs}</p>
      <div className="pt-4 border-t border-zinc-100 text-sm text-zinc-600 space-y-1">
        <p>
          <strong>Location:</strong> {publicSettings.businessAddress}
        </p>
        <p>
          <strong>Currency:</strong> Nigerian Naira (NGN)
        </p>
        <p>
          <strong>Payment Method:</strong> Direct Bank Transfer
        </p>
      </div>
    </PolicyShell>
  );
}

export function ContactPage() {
  const { publicSettings } = useStore();
  return (
    <PolicyShell title="Contact Us" description={`Get in touch with ${publicSettings.storeName}.`}>
      <p>
        Reach our customer operations and dispatch verification desk during business hours
        (Monday–Saturday, 8:00 AM – 6:00 PM WAT):
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
        <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200 space-y-1 text-sm">
          <p className="text-xs text-zinc-500">Email Support</p>
          <p className="font-semibold text-zinc-900">{publicSettings.contactEmail}</p>
        </div>
        <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200 space-y-1 text-sm">
          <p className="text-xs text-zinc-500">Phone Line</p>
          <p className="font-mono font-semibold text-zinc-900">{publicSettings.phoneNumber}</p>
        </div>
        <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200 space-y-1 text-sm">
          <p className="text-xs text-zinc-500">WhatsApp Desk</p>
          <p className="font-mono font-semibold text-zinc-900">{publicSettings.whatsappNumber}</p>
        </div>
        <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200 space-y-1 text-sm">
          <p className="text-xs text-zinc-500">Office Address</p>
          <p className="font-semibold text-zinc-900">{publicSettings.businessAddress}</p>
        </div>
      </div>
    </PolicyShell>
  );
}

export function FaqPage() {
  const { publicSettings } = useStore();
  return (
    <PolicyShell title="Frequently Asked Questions" description="Answers about Nigerian bank transfers, delivery, and returns.">
      <div className="divide-y divide-zinc-100">
        {publicSettings.policies.faq.map((item, idx) => (
          <div key={idx} className="py-4 space-y-1.5">
            <h2 className="font-display font-semibold text-base text-zinc-900">{item.question}</h2>
            <p className="text-sm text-zinc-600 leading-relaxed">{item.answer}</p>
          </div>
        ))}
      </div>
    </PolicyShell>
  );
}

export function PrivacyPolicyPage() {
  const { publicSettings } = useStore();
  return (
    <PolicyShell title="Privacy Policy" description="How we protect your personal information.">
      {publicSettings.policies.privacyPolicy}
    </PolicyShell>
  );
}

export function TermsPage() {
  const { publicSettings } = useStore();
  return (
    <PolicyShell title="Terms & Conditions" description="Storefront terms of purchase in Nigeria.">
      {publicSettings.policies.termsAndConditions}
    </PolicyShell>
  );
}

export function ShippingPolicyPage() {
  const { publicSettings, deliveryZones } = useStore();
  return (
    <PolicyShell title="Shipping & Delivery Policy" description="Owner-managed Nigerian delivery zones and fees.">
      <p>{publicSettings.policies.shippingPolicy}</p>
      {deliveryZones.length > 0 && (
        <div className="pt-4 space-y-3">
          <h2 className="font-display text-lg font-bold text-zinc-900">
            Active Nigerian Delivery Zones
          </h2>
          <div className="overflow-x-auto border border-zinc-200 rounded-xl">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-50 border-b border-zinc-200 text-xs text-zinc-500">
                <tr>
                  <th className="py-3 px-4">Zone</th>
                  <th className="py-3 px-4">Supported States</th>
                  <th className="py-3 px-4">Timeline</th>
                  <th className="py-3 px-4 text-right">Fee</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {deliveryZones.map((z) => (
                  <tr key={z.zoneId}>
                    <td className="py-3 px-4 font-medium text-zinc-900">{z.name}</td>
                    <td className="py-3 px-4 text-zinc-600">{z.supportedStates.join(', ')}</td>
                    <td className="py-3 px-4 text-zinc-600">{z.estimatedDeliveryDays}</td>
                    <td className="py-3 px-4 text-right font-mono font-semibold tabular-nums">
                      {formatNaira(z.deliveryFeeKobo)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </PolicyShell>
  );
}

export function ReturnsPolicyPage() {
  const { publicSettings } = useStore();
  return (
    <PolicyShell title="Returns & Refund Policy" description="Return eligibility and bank-transfer refund timelines.">
      {publicSettings.policies.returnsPolicy}
    </PolicyShell>
  );
}

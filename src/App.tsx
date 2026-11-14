/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useEffect } from 'react';
import { BrowserRouter, Link, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { StoreProvider } from './context/StoreContext';
import { StoreLayout } from './components/StoreLayout';

// Customer Storefront Pages
import { HomePage } from './pages/store/HomePage';
import { ShopPage } from './pages/store/ShopPage';
import { ProductDetailsPage } from './pages/store/ProductDetailsPage';
import { CartPage } from './pages/store/CartPage';
import { CheckoutPage } from './pages/store/CheckoutPage';
import {
  ForgotPasswordPage,
  LoginPage,
  RegisterPage,
  ResetPasswordPage,
} from './pages/store/AuthPages';
import { AccountPage } from './pages/store/AccountPage';
import { OrderDetailPage } from './pages/store/OrderDetailPage';
import {
  AboutPage,
  ContactPage,
  FaqPage,
  PrivacyPolicyPage,
  ReturnsPolicyPage,
  ShippingPolicyPage,
  TermsPage,
} from './pages/store/StaticPolicyPages';

// Admin Dashboard Pages
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage';
import { AdminProductFormPage, AdminProductsPage } from './pages/admin/AdminProductsPage';
import { AdminCategoriesPage } from './pages/admin/AdminCategoriesPage';
import { AdminDiscountsPage } from './pages/admin/AdminDiscountsPage';
import {
  AdminOrderDetailPage,
  AdminOrdersPage,
  AdminPaymentsQueuePage,
} from './pages/admin/AdminOrdersPage';
import {
  AdminCustomersPage,
  AdminDeliveryZonesPage,
  AdminInventoryPage,
  AdminNotificationsPage,
  AdminReviewsPage,
  AdminSettingsPage,
} from './pages/admin/AdminOperationsPages';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function NotFoundPage() {
  return (
    <StoreLayout>
      <div className="max-w-xl mx-auto px-4 py-20 text-center space-y-5">
        <p className="text-xs font-mono uppercase tracking-widest text-zinc-500">404</p>
        <h1 className="font-display text-3xl font-bold text-zinc-900">Page not found</h1>
        <p className="text-sm text-zinc-600">
          The page or product you requested is unavailable or may have been moved.
        </p>
        <div className="flex items-center justify-center gap-3 pt-2">
          <Link
            to="/"
            className="px-5 py-2.5 rounded-lg bg-[#065F46] text-white text-sm font-medium hover:bg-[#054e3a]"
          >
            Back to Home
          </Link>
          <Link
            to="/shop"
            className="px-5 py-2.5 rounded-lg border border-zinc-200 bg-white text-zinc-800 text-sm font-medium hover:bg-zinc-50"
          >
            Browse Catalog
          </Link>
        </div>
      </div>
    </StoreLayout>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <AuthProvider>
        <StoreProvider>
          <Routes>
            {/* Customer Storefront Routes */}
            <Route path="/" element={<HomePage />} />
            <Route path="/shop" element={<ShopPage />} />
            <Route path="/category/:slug" element={<ShopPage />} />
            <Route path="/product/:slug" element={<ProductDetailsPage />} />
            <Route path="/cart" element={<CartPage />} />
            <Route path="/checkout" element={<CheckoutPage />} />

            {/* Auth Routes */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/auth/action" element={<ResetPasswordPage />} />
            <Route path="/__/auth/action" element={<ResetPasswordPage />} />

            {/* Customer Account Routes */}
            <Route path="/account" element={<AccountPage />} />
            <Route path="/account/orders" element={<AccountPage />} />
            <Route path="/account/orders/:orderId" element={<OrderDetailPage />} />
            <Route path="/account/addresses" element={<AccountPage />} />

            {/* Informational & Policy Routes */}
            <Route path="/about" element={<AboutPage />} />
            <Route path="/contact" element={<ContactPage />} />
            <Route path="/faq" element={<FaqPage />} />
            <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/shipping-policy" element={<ShippingPolicyPage />} />
            <Route path="/returns-policy" element={<ReturnsPolicyPage />} />

            {/* Protected Admin Dashboard Routes */}
            <Route path="/admin" element={<AdminDashboardPage />} />
            <Route path="/admin/products" element={<AdminProductsPage />} />
            <Route path="/admin/products/new" element={<AdminProductFormPage />} />
            <Route path="/admin/products/:productId/edit" element={<AdminProductFormPage />} />
            <Route path="/admin/categories" element={<AdminCategoriesPage />} />
            <Route path="/admin/discounts" element={<AdminDiscountsPage />} />
            <Route path="/admin/orders" element={<AdminOrdersPage />} />
            <Route path="/admin/orders/:orderId" element={<AdminOrderDetailPage />} />
            <Route path="/admin/payments" element={<AdminPaymentsQueuePage />} />
            <Route path="/admin/customers" element={<AdminCustomersPage />} />
            <Route path="/admin/inventory" element={<AdminInventoryPage />} />
            <Route path="/admin/delivery" element={<AdminDeliveryZonesPage />} />
            <Route path="/admin/reviews" element={<AdminReviewsPage />} />
            <Route path="/admin/notifications" element={<AdminNotificationsPage />} />
            <Route path="/admin/settings" element={<AdminSettingsPage />} />

            {/* 404 Fallback */}
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </StoreProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
